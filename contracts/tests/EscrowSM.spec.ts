import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Address, Cell, Dictionary, toNano } from 'ton';
import { EscrowSM, EscrowSMData, Opcodes, EscrowState } from '../wrappers/EscrowSM';
import '@ton-community/test-utils';

describe('EscrowSM', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let escrowSM: SandboxContract<EscrowSM>;
    let ziverTreasury: SandboxContract<TreasuryContract>; // Changed to SandboxContract
    let taskPoster: SandboxContract<TreasuryContract>;
    let performer1: SandboxContract<TreasuryContract>;
    let performer2: SandboxContract<TreasuryContract>;
    let moderator: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        ziverTreasury = await blockchain.treasury('ziverTreasury'); // Created within test environment

        const initialData: EscrowSMData = {
            tasks: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
            ziverTreasuryAddress: ziverTreasury.address, // Using the test treasury address
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
        expect((await escrowSM.getZiverTreasuryAddress()).toString()).toEqual(ziverTreasury.address.toString());
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
        expect(performer1BalAfter - performer1BalBefore).toBeGreaterThanOrEqual(payment - fee - toNano('0.05'));

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

        const treasuryBalBefore = await ziverTreasury.getBalance(); // Updated
        await escrowSM.sendWithdrawFee(escrowSM, ziverTreasury.getSender(), { // Updated
            value: toNano('0.05'),
            queryID: 34n,
        });
        expect(await escrowSM.getAccumulatedFees(escrowSM)).toEqual(0n);
        const treasuryBalAfter = await ziverTreasury.getBalance(); // Updated
        expect(treasuryBalAfter - treasuryBalBefore).toBeGreaterThanOrEqual(fee - toNano('0.05'));
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
            reasonHash: 321n, // Note: reasonHash is not used in the contract logic, but required by wrapper
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
            value: payment / 2n + toNano('0.05'), // Partial deposit
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

    // --- Enhanced Security & Edge Case Tests ---

    it('should REJECT verification from a non-poster address', async () => {
        // GIVEN a task is created and funded
        const taskId = 6001n;
        const payment = toNano('1');
        await escrowSM.sendSetTaskDetails(escrowSM, taskPoster.getSender(), { taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 1n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 5n, moderatorAddress: moderator.address, value: toNano('0.05'), queryID: 61n });
        await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), { taskId, value: payment + toNano('0.05'), queryID: 62n });

        // WHEN a random user (performer2) tries to verify performer1
        const promise = escrowSM.sendVerifyTaskCompletion(escrowSM, performer2.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 63n,
        });

        // THEN the transaction must fail with the correct error code
        await expect(promise).rejects.toThrow(/exit code 103/i); // error_not_task_poster
    });

    it('should REJECT fee withdrawal from a non-treasury address', async () => {
        // GIVEN a task has completed and generated fees
        const taskId = 7001n;
        const payment = toNano('1');
        await escrowSM.sendSetTaskDetails(escrowSM, taskPoster.getSender(), { taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 1n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 10n, moderatorAddress: moderator.address, value: toNano('0.05'), queryID: 71n });
        await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), { taskId, value: payment + toNano('0.05'), queryID: 72n });
        await escrowSM.sendVerifyTaskCompletion(escrowSM, taskPoster.getSender(), { taskId, performerAddress: performer1.address, value: toNano('0.05'), queryID: 73n });

        // WHEN a random user (the task poster) tries to withdraw the fees
        const promise = escrowSM.sendWithdrawFee(escrowSM, taskPoster.getSender(), {
            value: toNano('0.05'),
            queryID: 74n,
        });

        // THEN the transaction must fail with the correct error code
        await expect(promise).rejects.toThrow(/exit code 100/i); // error_not_owner
    });

    it('should REJECT verifying an already completed performer', async () => {
        // GIVEN a task is created, funded, and performer1 has already been verified
        const taskId = 8001n;
        const payment = toNano('1');
        await escrowSM.sendSetTaskDetails(escrowSM, taskPoster.getSender(), { taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 2n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 5n, moderatorAddress: moderator.address, value: toNano('0.05'), queryID: 81n });
        await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), { taskId, value: payment * 2n + toNano('0.05'), queryID: 82n });
        await escrowSM.sendVerifyTaskCompletion(escrowSM, taskPoster.getSender(), { taskId, performerAddress: performer1.address, value: toNano('0.05'), queryID: 83n });

        // WHEN the poster tries to verify performer1 a second time
        const promise = escrowSM.sendVerifyTaskCompletion(escrowSM, taskPoster.getSender(), {
            taskId,
            performerAddress: performer1.address,
            value: toNano('0.05'),
            queryID: 84n,
        });

        // THEN the transaction must fail with the correct error code
        await expect(promise).rejects.toThrow(/exit code 118/i); // error_already_completed_performer
    });

    it('should handle overpayment on deposit and refund the excess', async () => {
        // GIVEN a new task is created
        const taskId = 9001n;
        const payment = toNano('5');
        await escrowSM.sendSetTaskDetails(escrowSM, taskPoster.getSender(), { taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 1n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 5n, moderatorAddress: moderator.address, value: toNano('0.05'), queryID: 91n });

        const posterBalanceBefore = await taskPoster.getBalance();
        const overpaymentAmount = toNano('2'); // Poster sends 2 TON extra

        // WHEN the poster deposits more than the required amount
        await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), {
            taskId,
            value: payment + overpaymentAmount + toNano('0.05'), // Required + overpayment + gas
            queryID: 92n,
        });
        
        // THEN the excess amount should be refunded automatically
        const posterBalanceAfter = await taskPoster.getBalance();
        const expectedBalanceAfterCharged = posterBalanceBefore - payment - toNano('0.05'); // Approx balance if only charged for payment + gas
        expect(posterBalanceAfter).toBeGreaterThan(expectedBalanceAfterCharged); // Balance is higher than if they were charged the full amount
        
        // AND the contract's internal balance should only be the required amount
        const td = await escrowSM.getTaskDetails(escrowSM, taskId);
        expect(td?.totalEscrowedFunds).toEqual(payment);
    });

    it('should handle dispute resolution where the poster wins', async () => {
        // GIVEN a task is created, funded, and in a dispute state
        const taskId = 4002n;
        const payment = toNano('1');
        await escrowSM.sendSetTaskDetails(escrowSM, taskPoster.getSender(), { taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 1n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 5n, moderatorAddress: moderator.address, value: toNano('0.05'), queryID: 41n });
        await escrowSM.sendDepositFunds(escrowSM, taskPoster.getSender(), { taskId, value: payment + toNano('0.05'), queryID: 42n });
        await escrowSM.sendSubmitProof(escrowSM, performer1.getSender(), { taskId, proofHash: 123n, value: toNano('0.05'), queryID: 43n });
        await escrowSM.sendRaiseDispute(escrowSM, taskPoster.getSender(), { taskId, reasonHash: 321n, value: toNano('0.05'), queryID: 44n });

        const posterBalanceBefore = await taskPoster.getBalance();

        // WHEN the moderator resolves the dispute in favor of the poster
        await escrowSM.sendResolveDispute(escrowSM, moderator.getSender(), {
            taskId,
            winnerAddress: taskPoster.address,
            value: toNano('0.05'),
            queryID: 46n,
        });

        // THEN the task state should be settled and the poster should be refunded
        const td = await escrowSM.getTaskDetails(escrowSM, taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
        expect(td?.totalEscrowedFunds).toEqual(0n);

        const posterBalanceAfter = await taskPoster.getBalance();
        expect(posterBalanceAfter).toBeGreaterThan(posterBalanceBefore); // Poster got their money back
    });
});
