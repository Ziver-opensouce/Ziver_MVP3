import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Address, Cell, Dictionary, toNano } from 'ton';
import { EscrowSM, EscrowSMData, Opcodes, EscrowState } from '../wrappers/EscrowSM';
import '@ton-community/test-utils';

describe('EscrowSM', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let escrowSM: SandboxContract<EscrowSM>;
    let ziverTreasury: SandboxContract<TreasuryContract>;
    let taskPoster: SandboxContract<TreasuryContract>;
    let performer1: SandboxContract<TreasuryContract>;
    let performer2: SandboxContract<TreasuryContract>;
    let moderator: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        ziverTreasury = await blockchain.treasury('ziverTreasury');

        const initialData: EscrowSMData = {
            tasks: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
            ziverTreasuryAddress: ziverTreasury.address,
        };

        escrowSM = blockchain.openContract(await EscrowSM.fromInit(initialData));

        // Corrected Deployment Call
        await escrowSM.sendDeploy(deployer.getSender(), toNano('0.05'));

        taskPoster = await blockchain.treasury('taskPoster');
        performer1 = await blockchain.treasury('performer1');
        performer2 = await blockchain.treasury('performer2');
        moderator = await blockchain.treasury('moderator');
    });

    it('should deploy and have correct initial data', async () => {
        expect((await escrowSM.getZiverTreasuryAddress()).toString()).toEqual(ziverTreasury.address.toString());
        expect(await escrowSM.getAccumulatedFees()).toEqual(0n);
    });

    it('should create, fund, expire and refund a task (auto-expiry)', async () => {
        const taskId = 1001n;
        const payment = toNano('2');
        const nPerformers = 1n;
        const expiry = BigInt(Math.floor(Date.now() / 1000) + 1); // expires in 1 second

        // Corrected
        await escrowSM.send.sendSetTaskDetails(taskPoster.getSender(), {
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
        expect(td?.currentState).toEqual(EscrowState.Idle);

        // Corrected
        await escrowSM.send.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 2n,
        });
        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.totalEscrowedFunds).toEqual(payment);
        expect(td?.currentState).toEqual(EscrowState.Active);

        await new Promise(res => setTimeout(res, 1200)); // Wait for expiry

        // Corrected
        await escrowSM.send.sendExpireTask(performer1.getSender(), {
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
        const nPerformers = 1n;
        const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // Corrected
        await escrowSM.send.sendSetTaskDetails(taskPoster.getSender(), {
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

        // Corrected
        await escrowSM.send.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 11n,
        });

        await expect(async () => {
            // Corrected
            await escrowSM.send.sendDepositFunds(taskPoster.getSender(), {
                taskId,
                value: payment + toNano('0.05'),
                queryID: 11n,
            });
        }).rejects.toThrow(/exit code 257/i);
    });

    it('should complete task and accumulate fees', async () => {
        const taskId = 2001n;
        const payment = toNano('3');
        const feePct = 10n;

        // Corrected
        await escrowSM.send.sendSetTaskDetails(taskPoster.getSender(), {
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
        // Corrected
        await escrowSM.send.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 22n,
        });

        const performer1BalBefore = await performer1.getBalance();
        // Corrected
        await escrowSM.send.sendVerifyTaskCompletion(taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 23n,
        });
        const fee = (payment * feePct) / 100n;
        const performer1BalAfter = await performer1.getBalance();
        expect(performer1BalAfter - performer1BalBefore).toBeGreaterThanOrEqual(payment - fee - toNano('0.05'));

        expect(await escrowSM.getAccumulatedFees()).toEqual(fee);
    });

    it('should handle multiple performers and settle correctly', async () => {
        const taskId = 2022n;
        const payment = toNano('1');
        const nPerformers = 2n;

        // Corrected
        await escrowSM.send.sendSetTaskDetails(taskPoster.getSender(), {
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
        // Corrected
        await escrowSM.send.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment * nPerformers + toNano('0.05'),
            queryID: 102n,
        });
        // Corrected
        await escrowSM.send.sendVerifyTaskCompletion(taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 103n,
        });
        let td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.PendingVerification);

        // Corrected
        await escrowSM.send.sendVerifyTaskCompletion(taskPoster.getSender(), {
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

        // Corrected
        await escrowSM.send.sendSetTaskDetails(taskPoster.getSender(), {
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
        // Corrected
        await escrowSM.send.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 32n,
        });
        // Corrected
        await escrowSM.send.sendVerifyTaskCompletion(taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 33n,
        });

        const fee = (payment * feePct) / 100n;
        expect(await escrowSM.getAccumulatedFees()).toEqual(fee);

        const treasuryBalBefore = await ziverTreasury.getBalance();
        // Corrected
        await escrowSM.send.sendWithdrawFee(ziverTreasury.getSender(), {
            value: toNano('0.05'),
            queryID: 34n,
        });
        expect(await escrowSM.getAccumulatedFees()).toEqual(0n);
        const treasuryBalAfter = await ziverTreasury.getBalance();
        expect(treasuryBalAfter - treasuryBalBefore).toBeGreaterThanOrEqual(fee - toNano('0.05'));
    });

    it('should handle disputes and moderator resolution', async () => {
        const taskId = 4001n;
        const payment = toNano('1');

        // Corrected
        await escrowSM.send.sendSetTaskDetails(taskPoster.getSender(), {
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
        // Corrected
        await escrowSM.send.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment + toNano('0.05'),
            queryID: 42n,
        });
        // Corrected
        await escrowSM.send.sendSubmitProof(performer1.getSender(), {
            taskId,
            proofHash: 123n,
            value: toNano('0.05'),
            queryID: 43n,
        });
        // Corrected
        await escrowSM.send.sendRaiseDispute(taskPoster.getSender(), {
            taskId,
            value: toNano('0.05'),
            queryID: 44n,
        });
        // Corrected
        await escrowSM.send.sendResolveDispute(moderator.getSender(), {
            taskId,
            winnerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 45n,
        });

        const td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
    });

    it('should cancel and refund before activation', async () => {
        const taskId = 5001n;
        const payment = toNano('2');

        // Corrected
        await escrowSM.send.sendSetTaskDetails(taskPoster.getSender(), {
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
        // Corrected
        await escrowSM.send.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment / 2n + toNano('0.05'), // Partial deposit
            queryID: 52n,
        });
        // Corrected
        await escrowSM.send.sendCancelTaskAndRefund(taskPoster.getSender(), {
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
        // Corrected
        await escrowSM.send.sendSetTaskDetails(taskPoster.getSender(), { taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 1n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 5n, moderatorAddress: moderator.address, value: toNano('0.05'), queryID: 61n });
        // Corrected
        await escrowSM.send.sendDepositFunds(taskPoster.getSender(), { taskId, value: payment + toNano('0.05'), queryID: 62n });

        // Corrected
        const promise = escrowSM.send.sendVerifyTaskCompletion(performer2.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 63n,
        });

        await expect(promise).rejects.toThrow(/exit code 103/i);
    });

    it('should REJECT fee withdrawal from a non-treasury address', async () => {
        const taskId = 7001n;
        const payment = toNano('1');
        // Corrected
        await escrowSM.send.sendSetTaskDetails(taskPoster.getSender(), { taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 1n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 10n, moderatorAddress: moderator.address, value: toNano('0.05'), queryID: 71n });
        // Corrected
        await escrowSM.send.sendDepositFunds(taskPoster.getSender(), { taskId, value: payment + toNano('0.05'), queryID: 72n });
        // Corrected
        await escrowSM.send.sendVerifyTaskCompletion(taskPoster.getSender(), { taskId, performerAddress: performer1.address, value: toNano('0.05'), queryID: 73n });

        // Corrected
        const promise = escrowSM.send.sendWithdrawFee(taskPoster.getSender(), {
            value: toNano('0.05'),
            queryID: 74n,
        });

        await expect(promise).rejects.toThrow(/exit code 100/i);
    });

    it('should REJECT verifying an already completed performer', async () => {
        const taskId = 8001n;
        const payment = toNano('1');
        // Corrected
        await escrowSM.send.sendSetTaskDetails(taskPoster.getSender(), { taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 2n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 5n, moderatorAddress: moderator.address, value: toNano('0.05'), queryID: 81n });
        // Corrected
        await escrowSM.send.sendDepositFunds(taskPoster.getSender(), { taskId, value: payment * 2n + toNano('0.05'), queryID: 82n });
        // Corrected
        await escrowSM.send.sendVerifyTaskCompletion(taskPoster.getSender(), { taskId, performerAddress: performer1.address, value: toNano('0.05'), queryID: 83n });

        // Corrected
        const promise = escrowSM.send.sendVerifyTaskCompletion(taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 84n,
        });

        await expect(promise).rejects.toThrow(/exit code 118/i);
    });

    it('should handle overpayment on deposit and refund the excess', async () => {
        const taskId = 9001n;
        const payment = toNano('5');
        // Corrected
        await escrowSM.send.sendSetTaskDetails(taskPoster.getSender(), { taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 1n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 5n, moderatorAddress: moderator.address, value: toNano('0.05'), queryID: 91n });

        const posterBalanceBefore = await taskPoster.getBalance();
        const overpaymentAmount = toNano('2');

        // Corrected
        await escrowSM.send.sendDepositFunds(taskPoster.getSender(), {
            taskId,
            value: payment + overpaymentAmount + toNano('0.05'),
            queryID: 92n,
        });
        
        const posterBalanceAfter = await taskPoster.getBalance();
        const expectedBalanceAfterCharged = posterBalanceBefore - payment - toNano('0.05');
        expect(posterBalanceAfter).toBeGreaterThan(expectedBalanceAfterCharged);
        
        const td = await escrowSM.getTaskDetails(taskId);
        expect(td?.totalEscrowedFunds).toEqual(payment);
    });

    it('should handle dispute resolution where the poster wins', async () => {
        const taskId = 4002n;
        const payment = toNano('1');
        // Corrected
        await escrowSM.send.sendSetTaskDetails(taskPoster.getSender(), { taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 1n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 5n, moderatorAddress: moderator.address, value: toNano('0.05'), queryID: 41n });
        // Corrected
        await escrowSM.send.sendDepositFunds(taskPoster.getSender(), { taskId, value: payment + toNano('0.05'), queryID: 42n });
        // Corrected
        await escrowSM.send.sendSubmitProof(performer1.getSender(), { taskId, proofHash: 123n, value: toNano('0.05'), queryID: 43n });
        // Corrected
        await escrowSM.send.sendRaiseDispute(taskPoster.getSender(), {
            value: toNano('0.05'),
            queryID: 44n,
            taskId,
        });

        const posterBalanceBefore = await taskPoster.getBalance();

        // Corrected
        await escrowSM.send.sendResolveDispute(moderator.getSender(), {
            taskId,
            winnerAddress: taskPoster.address,
            value: toNano('0.05'),
            queryID: 46n,
        });

        const td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
        expect(td?.totalEscrowedFunds).toEqual(0n);

        const posterBalanceAfter = await taskPoster.getBalance();
        expect(posterBalanceAfter).toBeGreaterThan(posterBalanceBefore);
    });
});
