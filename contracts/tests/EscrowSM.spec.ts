import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Address, Cell, Dictionary, toNano } from 'ton';
import { EscrowSM, EscrowSMData, Opcodes, EscrowState } from '../wrappers/EscrowSM';
import '@ton-community/test-utils';

describe('EscrowSM', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let escrowSM: SandboxContract<EscrowSM>;
    let ziverTreasury: Address;
    let taskPoster: SandboxContract<TreasuryContract>;
    let performer1: SandboxContract<TreasuryContract>;
    let performer2: SandboxContract<TreasuryContract>;
    let moderator: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        ziverTreasury = Address.parse('UQDl_5CtQqwxSKk9EoUbgKV6XsSDQqqkYYeZ0UFduTZuCtlP');

        const initialData: EscrowSMData = {
            tasks: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
            ziverTreasuryAddress: ziverTreasury,
        };

        escrowSM = blockchain.openContract(await EscrowSM.fromInit(initialData));

        await escrowSM.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Deploy', queryId: 0n }
        );

        taskPoster = await blockchain.treasury('taskPoster');
        performer1 = await blockchain.treasury('performer1');
        performer2 = await blockchain.treasury('performer2');
        moderator = await blockchain.treasury('moderator');
    });

    it('should deploy and have correct initial data', async () => {
        expect((await escrowSM.getZiverTreasuryAddress()).toString()).toEqual(ziverTreasury.toString());
        expect(await escrowSM.getAccumulatedFees()).toEqual(0n);
    });

    it('should create, fund, expire and refund a task (auto-expiry)', async () => {
        const taskId = 1001n;
        const payment = toNano('2');
        const nPerformers = 1n;
        const expiry = BigInt(Math.floor(Date.now() / 1000) + 1); // expires in 1 second

        await escrowSM.sendSetTaskDetails(escrowSM, taskPoster.getSender(), {
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
        let td = await escrowSM.getTaskDetails(escrowSM, taskId);
        expect(td?.currentState).toEqual(EscrowState.Idle);

        await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 2n,
        });
        td = await escrowSM.getTaskDetails(escrowSM, taskId);
        expect(td?.totalEscrowedFunds).toEqual(payment);
        expect(td?.currentState).toEqual(EscrowState.Active);

        await new Promise(res => setTimeout(res, 1200)); // Wait for expiry

        await escrowSM.sendExpireTask(escrowSM, performer1.getSender(), {
            taskId,
            value: toNano('0.05'),
            queryID: 3n,
        });
        td = await escrowSM.getTaskDetails(escrowSM, taskId);
        expect(td?.currentState).toEqual(EscrowState.Expired);
        expect(td?.totalEscrowedFunds).toEqual(0n);
    });

    it('should enforce replay protection (reject duplicate queryIDs)', async () => {
        const taskId = 1002n;
        const payment = toNano('1');
        const nPerformers = 1n;
        const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

        await escrowSM.sendSetTaskDetails(escrowSM, taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: nPerformers,
            taskDescriptionHash: 0n,
            taskGoalHash: 0n,
            expiryTimestamp: expiry,
            ziverFeePercentage: 5n,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
            queryID: 10n,
        });

        await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 11n,
        });

        // Try duplicate queryID: should throw
        await expect(async () => {
            await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), {
                taskId,
                value: payment + toNano('0.05'),
                queryID: 11n,
            });
        }).rejects.toThrow(/exit code 257/i); // error_replay
    });

    it('should complete task and accumulate fees', async () => {
        const taskId = 2001n;
        const payment = toNano('3');
        const nPerformers = 1n;
        const feePct = 10n;

        await escrowSM.sendSetTaskDetails(escrowSM, taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: nPerformers,
            taskDescriptionHash: 10n,
            taskGoalHash: 20n,
            expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
            ziverFeePercentage: feePct,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
            queryID: 21n,
        });
        await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 22n,
        });

        const performer1BalBefore = await performer1.getBalance();
        await escrowSM.sendVerifyTaskCompletion(escrowSM, taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 23n,
        });
        const fee = payment * feePct / 100n;
        const performer1BalAfter = await performer1.getBalance();
        expect(performer1BalAfter - performer1BalBefore).toBeGreaterThanOrEqual(payment - fee);

        expect(await escrowSM.getAccumulatedFees(escrowSM)).toEqual(fee);
    });

    it('should handle multiple performers and settle correctly', async () => {
        const taskId = 2022n;
        const payment = toNano('1');
        const nPerformers = 2n;
        const feePct = 10n;

        await escrowSM.sendSetTaskDetails(escrowSM, taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: nPerformers,
            taskDescriptionHash: 1n,
            taskGoalHash: 2n,
            expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
            ziverFeePercentage: feePct,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
            queryID: 101n,
        });
        await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), {
            taskId,
            value: payment * nPerformers + toNano('0.05'),
            queryID: 102n,
        });
        await escrowSM.sendVerifyTaskCompletion(escrowSM, taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 103n,
        });
        let td = await escrowSM.getTaskDetails(escrowSM, taskId);
        expect(td?.currentState).toEqual(EscrowState.PendingVerification);
        await escrowSM.sendVerifyTaskCompletion(escrowSM, taskPoster.getSender(), {
            taskId,
            performerAddress: performer2.address,
            value: toNano('0.05'),
            queryID: 104n,
        });
        td = await escrowSM.getTaskDetails(escrowSM, taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
        expect(td?.totalEscrowedFunds).toEqual(0n);
    });

    it('should allow treasury to withdraw accumulated fees', async () => {
        const taskId = 3001n;
        const payment = toNano('1');
        const nPerformers = 1n;
        const feePct = 10n;

        await escrowSM.sendSetTaskDetails(escrowSM, taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: nPerformers,
            taskDescriptionHash: 0n,
            taskGoalHash: 0n,
            expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
            ziverFeePercentage: feePct,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
            queryID: 31n,
        });
        await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 32n,
        });
        await escrowSM.sendVerifyTaskCompletion(escrowSM, taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 33n,
        });

        const fee = payment * feePct / 100n;
        expect(await escrowSM.getAccumulatedFees(escrowSM)).toEqual(fee);

        const treasuryBalBefore = await blockchain.getBalance(ziverTreasury);
        await escrowSM.sendWithdrawFee(escrowSM, blockchain.sender(ziverTreasury), {
            value: toNano('0.05'),
            queryID: 34n,
        });
        expect(await escrowSM.getAccumulatedFees(escrowSM)).toEqual(0n);
        const treasuryBalAfter = await blockchain.getBalance(ziverTreasury);
        expect(treasuryBalAfter - treasuryBalBefore).toBeGreaterThanOrEqual(fee);
    });

    it('should handle disputes and moderator resolution', async () => {
        const taskId = 4001n;
        const payment = toNano('1');
        const nPerformers = 1n;

        await escrowSM.sendSetTaskDetails(escrowSM, taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: nPerformers,
            taskDescriptionHash: 0n,
            taskGoalHash: 0n,
            expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
            ziverFeePercentage: 5n,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
            queryID: 41n,
        });
        await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 42n,
        });

        await escrowSM.sendSubmitProof(escrowSM, performer1.getSender(), {
            taskId,
            proofHash: 123n,
            value: toNano('0.05'),
            queryID: 43n,
        });

        await escrowSM.sendRaiseDispute(escrowSM, taskPoster.getSender(), {
            taskId,
            reasonHash: 321n,
            value: toNano('0.05'),
            queryID: 44n,
        });

        await escrowSM.sendResolveDispute(escrowSM, moderator.getSender(), {
            taskId,
            winnerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 45n,
        });

        const td = await escrowSM.getTaskDetails(escrowSM, taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
    });

    it('should cancel and refund before activation', async () => {
        const taskId = 5001n;
        const payment = toNano('2');
        const nPerformers = 1n;
        const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

        await escrowSM.sendSetTaskDetails(escrowSM, taskPoster.getSender(), {
            taskId,
            paymentPerPerformerAmount: payment,
            numberOfPerformersNeeded: nPerformers,
            taskDescriptionHash: 0n,
            taskGoalHash: 0n,
            expiryTimestamp: expiry,
            ziverFeePercentage: 2n,
            moderatorAddress: moderator.address,
            value: toNano('0.05'),
            queryID: 51n,
        });
        await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), {
            taskId,
            value: payment / 2n + toNano('0.05'),
            queryID: 52n,
        });
        await escrowSM.sendCancelTaskAndRefund(escrowSM, taskPoster.getSender(), {
            taskId,
            value: toNano('0.05'),
            queryID: 53n,
        });
        const td = await escrowSM.getTaskDetails(escrowSM, taskId);
        expect(td?.currentState).toEqual(EscrowState.Refunded);
        expect(td?.totalEscrowedFunds).toEqual(0n);
    });

    // --- Add more edge case/error scenario tests below if needed ---
});