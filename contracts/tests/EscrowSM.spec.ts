import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, toNano, Dictionary } from '@ton/core';
import { EscrowSM } from '../wrappers/EscrowSM';
import { EscrowSMData, Opcodes, EscrowState } from '../EscrowSM.types';
import '@ton/test-utils';

describe('EscrowSM', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let escrowSM: SandboxContract<EscrowSM>;
    let ziverTreasury: SandboxContract<TreasuryContract>;
    let taskPoster: SandboxContract<TreasuryContract>;
    let performer1: SandboxContract<TreasuryContract>;
    let performer2: SandboxContract<TreasuryContract>;
    let moderator: SandboxContract<TreasuryContract>;

    // Use a counter to ensure unique task IDs for each test
    let taskIdCounter = 1000n;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        ziverTreasury = await blockchain.treasury('ziverTreasury');
        taskPoster = await blockchain.treasury('taskPoster');
        performer1 = await blockchain.treasury('performer1');
        performer2 = await blockchain.treasury('performer2');
        moderator = await blockchain.treasury('moderator');

        const initialData: EscrowSMData = {
            ziverTreasuryAddress: ziverTreasury.address,
            tasks: Dictionary.empty(),
            accumulatedFees: 0n,
        };

        escrowSM = blockchain.openContract(EscrowSM.createFromConfig(initialData, 0));

        const deployResult = await escrowSM.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowSM.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy and have correct initial data', async () => {
        expect((await escrowSM.getZiverTreasuryAddress()).equals(ziverTreasury.address)).toBe(true);
        expect(await escrowSM.getAccumulatedFees()).toEqual(0n);
    });

    it('should create, fund, expire and refund a task (auto-expiry)', async () => {
        const taskId = ++taskIdCounter;
        const payment = toNano('2');
        const expiry = BigInt(Math.floor(Date.now() / 1000) + 2); // Expires in 2 seconds

        await escrowSM.sendSetTaskDetails(taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: 1n,
            taskDescriptionHash: 123n,
            taskGoalHash: 456n,
            expiryTimestamp: expiry,
            ziverFeePercentage: 5n,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
        });

        let td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.TaskSetAndFundsPending);

        // FIX: The `value` should ONLY be the payment amount. Gas is handled separately.
        await escrowSM.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment,
        });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.totalEscrowedFunds).toEqual(payment);
        expect(td?.currentState).toEqual(EscrowState.Active);

        // Advance blockchain time past the expiry
        blockchain.now = Number(expiry) + 1;

        // Anyone can poke the contract to trigger expiry
        await escrowSM.sendExpireTask(deployer.getSender(), {
            taskId,
            value: toNano('0.05'),
        });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Expired);
        expect(td?.totalEscrowedFunds).toEqual(0n);
    });

    it('should enforce replay protection (reject duplicate queryIDs)', async () => {
        const taskId = ++taskIdCounter;
        await escrowSM.sendSetTaskDetails(taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: toNano('1'),
            numberOfPerformersNeeded: 1n,
            taskDescriptionHash: 0n,
            taskGoalHash: 0n,
            expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
            ziverFeePercentage: 5n,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
            queryID: 10n,
        });

        // First deposit is fine
        await escrowSM.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: toNano('1'),
            queryID: 11n,
        });

        // The second deposit with the same queryID must fail
        await expect(
            escrowSM.sendDepositFunds(taskPoster.getSender(), {
                taskId,
                value: toNano('1'),
                queryID: 11n, // Using the same queryID
            })
        ).rejects.toThrow();
    });

    it('should complete task and accumulate fees', async () => {
        const taskId = ++taskIdCounter;
        const payment = toNano('3');
        const feePct = 10n;
        const fee = (payment * feePct) / 100n;

        await escrowSM.sendSetTaskDetails(taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: 1n,
            taskDescriptionHash: 10n,
            taskGoalHash: 20n,
            expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
            ziverFeePercentage: feePct,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
        });

        await escrowSM.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment,
        });

        const performer1BalBefore = await performer1.getBalance();
        await escrowSM.sendVerifyTaskCompletion(taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
        });

        const performer1BalAfter = await performer1.getBalance();
        const expectedPayout = payment - fee;
        expect(performer1BalAfter - performer1BalBefore).toBeGreaterThan(expectedPayout - toNano('0.02'));
        expect(await escrowSM.getAccumulatedFees()).toEqual(fee);
    });

    it('should REJECT verification from a non-poster address', async () => {
        const taskId = ++taskIdCounter;
        const payment = toNano('1');

        await escrowSM.sendSetTaskDetails(taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: 1n,
            taskDescriptionHash: 0n,
            taskGoalHash: 0n,
            expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
            ziverFeePercentage: 5n,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
        });

        await escrowSM.sendDepositFunds(taskPoster.getSender(), { taskId, value: payment });

        // Attempt verification from an unauthorized address (performer2)
        await expect(
            escrowSM.sendVerifyTaskCompletion(performer2.getSender(), {
                taskId,
                performerAddress: performer1.address,
                value: toNano('0.05'),
            })
        ).rejects.toThrow();
    });

    it('should REJECT fee withdrawal from a non-treasury address', async () => {
        const taskId = ++taskIdCounter;
        const payment = toNano('1');

        await escrowSM.sendSetTaskDetails(taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: 1n,
            taskDescriptionHash: 0n,
            taskGoalHash: 0n,
            expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
            ziverFeePercentage: 10n,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
        });

        await escrowSM.sendDepositFunds(taskPoster.getSender(), { taskId, value: payment });

        await escrowSM.sendVerifyTaskCompletion(taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
        });

        // Attempt withdrawal from an unauthorized address (taskPoster)
        await expect(escrowSM.sendWithdrawFee(taskPoster.getSender(), { value: toNano('0.05') })).rejects.toThrow();
    });
});
