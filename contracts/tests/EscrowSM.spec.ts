import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, Dictionary, toNano } from '@ton/core';
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

        // This runs before each test
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
        const taskId = 1001n;
        const payment = toNano('2');
        const nPerformers = 1n;
        const expiry = BigInt(Math.floor(Date.now() / 1000) + 2);

        await escrowSM.sendSetTaskDetails(taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: nPerformers,
            taskDescriptionHash: 123n,
            taskGoalHash: 456n,
            expiryTimestamp: expiry,
            ziverFeePercentage: 5n,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
            queryID: 1n,
        });

        let td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.TaskSetAndFundsPending);

        await escrowSM.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 2n,
        });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.totalEscrowedFunds).toEqual(payment);
        expect(td?.currentState).toEqual(EscrowState.Active);

        blockchain.now = Number(expiry) + 1;

        await escrowSM.sendExpireTask(performer1.getSender(), {
            taskId,
            value: toNano('0.05'),
            queryID: 3n,
        });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Expired);
        expect(td?.totalEscrowedFunds).toEqual(0n);
    });

    it('should enforce replay protection (reject duplicate queryIDs)', async () => {
        const taskId = 1002n;
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
            queryID: 10n,
        });

        // First deposit is fine
        await escrowSM.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 11n,
        });

        // Try to send the same deposit transaction again (same queryID)
        await expect(
            escrowSM.sendDepositFunds(taskPoster.getSender(), {
                taskId,
                value: payment + toNano('0.05'),
                queryID: 11n,
            }),
        ).rejects.toThrow();
    });

    it('should complete task and accumulate fees', async () => {
        const taskId = 2001n;
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
            queryID: 21n,
        });

        await escrowSM.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 22n,
        });

        const performer1BalBefore = await performer1.getBalance();

        await escrowSM.sendVerifyTaskCompletion(taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 23n,
        });

        const performer1BalAfter = await performer1.getBalance();
        const expectedPayout = payment - fee;
        expect(performer1BalAfter - performer1BalBefore).toBeGreaterThan(expectedPayout - toNano('0.05'));
        expect(await escrowSM.getAccumulatedFees()).toEqual(fee);
    });

    it('should handle multiple performers and settle correctly', async () => {
        const taskId = 2022n;
        const payment = toNano('1');
        const nPerformers = 2n;

        await escrowSM.sendSetTaskDetails(taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: nPerformers,
            taskDescriptionHash: 1n,
            taskGoalHash: 2n,
            expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
            ziverFeePercentage: 10n,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
            queryID: 101n,
        });

        await escrowSM.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment * nPerformers + toNano('0.05'),
            queryID: 102n,
        });

        await escrowSM.sendVerifyTaskCompletion(taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 103n,
        });

        let td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.PendingVerification);

        await escrowSM.sendVerifyTaskCompletion(taskPoster.getSender(), {
            taskId,
            performerAddress: performer2.address,
            value: toNano('0.05'),
            queryID: 104n,
        });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
        expect(td?.totalEscrowedFunds).toEqual(0n);
    });

    it('should allow treasury to withdraw accumulated fees', async () => {
        const taskId = 3001n;
        const payment = toNano('1');
        const feePct = 10n;
        const fee = (payment * feePct) / 100n;

        await escrowSM.sendSetTaskDetails(taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: 1n,
            taskDescriptionHash: 0n,
            taskGoalHash: 0n,
            expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
            ziverFeePercentage: feePct,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
            queryID: 31n,
        });

        await escrowSM.sendDepositFunds(taskPoster.getSender(), { taskId, value: payment + toNano('0.05'), queryID: 32n });

        await escrowSM.sendVerifyTaskCompletion(taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 33n,
        });
        expect(await escrowSM.getAccumulatedFees()).toEqual(fee);

        const treasuryBalBefore = await ziverTreasury.getBalance();
        await escrowSM.sendWithdrawFee(ziverTreasury.getSender(), { value: toNano('0.05'), queryID: 34n });

        expect(await escrowSM.getAccumulatedFees()).toEqual(0n);
        const treasuryBalAfter = await ziverTreasury.getBalance();
        expect(treasuryBalAfter - treasuryBalBefore).toBeGreaterThan(fee - toNano('0.05'));
    });

    it('should handle disputes and moderator resolution (performer wins)', async () => {
        const taskId = 4001n;
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
            queryID: 41n,
        });

        await escrowSM.sendDepositFunds(taskPoster.getSender(), { taskId, value: payment + toNano('0.05'), queryID: 42n });

        await escrowSM.sendRaiseDispute(taskPoster.getSender(), { taskId, value: toNano('0.05'), queryID: 44n });

        let td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Disputed);

        await escrowSM.sendResolveDispute(moderator.getSender(), {
            taskId,
            winnerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 45n,
        });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
    });

    it('should cancel and refund before activation', async () => {
        const taskId = 5001n;
        const payment = toNano('2');

        await escrowSM.sendSetTaskDetails(taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: 1n,
            taskDescriptionHash: 0n,
            taskGoalHash: 0n,
            expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
            ziverFeePercentage: 2n,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
            queryID: 51n,
        });

        await escrowSM.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment / 2n + toNano('0.05'),
            queryID: 52n,
        });

        await escrowSM.sendCancelTaskAndRefund(taskPoster.getSender(), {
            taskId,
            value: toNano('0.05'),
            queryID: 53n,
        });

        const td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Refunded);
        expect(td?.totalEscrowedFunds).toEqual(0n);
    });

    // --- Enhanced Security & Edge Case Tests ---

    it('should REJECT verification from a non-poster address', async () => {
        const taskId = 6001n;
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
            queryID: 61n,
        });

        await escrowSM.sendDepositFunds(taskPoster.getSender(), { taskId, value: payment + toNano('0.05'), queryID: 62n });

        // Attempt verification from an unauthorized address (performer2)
        await expect(
            escrowSM.sendVerifyTaskCompletion(performer2.getSender(), {
                taskId,
                performerAddress: performer1.address,
                value: toNano('0.05'),
                queryID: 63n,
            }),
        ).rejects.toThrow();
    });

    it('should REJECT fee withdrawal from a non-treasury address', async () => {
        const taskId = 7001n;
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
            queryID: 71n,
        });

        await escrowSM.sendDepositFunds(taskPoster.getSender(), { taskId, value: payment + toNano('0.05'), queryID: 72n });

        await escrowSM.sendVerifyTaskCompletion(taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 73n,
        });

        // Attempt withdrawal from an unauthorized address (taskPoster)
        await expect(
            escrowSM.sendWithdrawFee(taskPoster.getSender(), {
                value: toNano('0.05'),
                queryID: 74n,
            }),
        ).rejects.toThrow();
    });

    it('should REJECT verifying an already completed performer', async () => {
        const taskId = 8001n;
        const payment = toNano('1');

        await escrowSM.sendSetTaskDetails(taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: 2n,
            taskDescriptionHash: 0n,
            taskGoalHash: 0n,
            expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
            ziverFeePercentage: 5n,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
            queryID: 81n,
        });

        await escrowSM.sendDepositFunds(taskPoster.getSender(), { taskId, value: payment * 2n + toNano('0.05'), queryID: 82n });

        await escrowSM.sendVerifyTaskCompletion(taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 83n,
        });

        // Attempt to verify the same performer again
        await expect(
            escrowSM.sendVerifyTaskCompletion(taskPoster.getSender(), {
                taskId,
                performerAddress: performer1.address,
                value: toNano('0.05'),
                queryID: 84n,
            }),
        ).rejects.toThrow();
    });

    it('should handle overpayment on deposit and refund the excess', async () => {
        const taskId = 9001n;
        const payment = toNano('5');

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
            queryID: 91n,
        });

        const posterBalanceBefore = await taskPoster.getBalance();
        const overpaymentAmount = toNano('2');

        await escrowSM.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment + overpaymentAmount + toNano('0.05'),
            queryID: 92n,
        });

        const posterBalanceAfter = await taskPoster.getBalance();
        const maxExpectedCost = payment + toNano('0.05');

        // Check that the cost was not more than the required payment + gas
        expect(posterBalanceBefore - posterBalanceAfter).toBeLessThan(maxExpectedCost + overpaymentAmount);
        // And that the refund was sent back (cost is close to payment + gas)
        expect(posterBalanceBefore - posterBalanceAfter).toBeGreaterThan(maxExpectedCost - toNano('0.01'));

        const td = await escrowSM.getTaskDetails(taskId);
        expect(td?.totalEscrowedFunds).toEqual(payment);
    });

    it('should handle dispute resolution where the poster wins', async () => {
        const taskId = 4002n;
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
            queryID: 91n,
        });

        await escrowSM.sendDepositFunds(taskPoster.getSender(), { taskId, value: payment + toNano('0.05'), queryID: 92n });

        await escrowSM.sendRaiseDispute(taskPoster.getSender(), { taskId, value: toNano('0.05'), queryID: 94n });

        const posterBalanceBefore = await taskPoster.getBalance();

        await escrowSM.sendResolveDispute(moderator.getSender(), {
            taskId,
            winnerAddress: taskPoster.address,
            value: toNano('0.05'),
            queryID: 95n,
        });

        const td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
        expect(td?.totalEscrowedFunds).toEqual(0n);

        const posterBalanceAfter = await taskPoster.getBalance();
        // Poster's balance should increase as they get the refund
        expect(posterBalanceAfter).toBeGreaterThan(posterBalanceBefore);
    });
});
