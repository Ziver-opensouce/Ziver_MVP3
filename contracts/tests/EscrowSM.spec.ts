import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'; // Corrected import
import { Address, Cell, Dictionary, toNano } from '@ton/core';
import { EscrowSM, EscrowSMData, EscrowState } from '../wrappers/EscrowSM';
import '@ton/test-utils'; // Corrected import

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
            tasks: Dictionary.empty(),
            ziverTreasuryAddress: ziverTreasury.address,
            accumulatedFees: 0n,
        };

        // Corrected the 'null' to '0' for the workchain
        escrowSM = blockchain.openContract(await EscrowSM.createFromConfig(initialData, 0));

        const deployResult = await escrowSM.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowSM.address,
            deploy: true,
            success: true,
        });

        taskPoster = await blockchain.treasury('taskPoster');
        performer1 = await blockchain.treasury('performer1');
        performer2 = await blockchain.treasury('performer2');
        moderator = await blockchain.treasury('moderator');
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

        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'SetTaskDetails',
                taskId,
                paymentPerPerformerAmount: payment,
                numberOfPerformersNeeded: nPerformers,
                taskDescriptionHash: 123n,
                taskGoalHash: 456n,
                expiryTimestamp: expiry,
                ziverFeePercentage: 5n,
                moderatorAddress: moderator.address,
                queryID: 1n,
            }
        });

        let td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.TaskSetAndFundsPending);

        await taskPoster.send({
            to: escrowSM.address,
            value: payment + toNano('0.05'),
            body: { $$type: 'DepositFunds', taskId, queryID: 2n }
        });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.totalEscrowedFunds).toEqual(payment);
        expect(td?.currentState).toEqual(EscrowState.Active);

        await blockchain.setUnixTime(Number(expiry) + 1);

        await performer1.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: { $$type: 'ExpireTask', taskId, queryID: 3n }
        });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Expired);
        expect(td?.totalEscrowedFunds).toEqual(0n);
    });

    it('should enforce replay protection (reject duplicate queryIDs)', async () => {
        const taskId = 1002n;
        const payment = toNano('1');
        const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'SetTaskDetails',
                taskId,
                paymentPerPerformerAmount: payment,
                numberOfPerformersNeeded: 1n,
                taskDescriptionHash: 0n,
                taskGoalHash: 0n,
                expiryTimestamp: expiry,
                ziverFeePercentage: 5n,
                moderatorAddress: moderator.address,
                queryID: 10n,
            }
        });

        await taskPoster.send({
            to: escrowSM.address,
            value: payment + toNano('0.05'),
            body: { $$type: 'DepositFunds', taskId, queryID: 11n }
        });

        await expect(
            taskPoster.send({
                to: escrowSM.address,
                value: payment + toNano('0.05'),
                body: { $$type: 'DepositFunds', taskId, queryID: 11n }
            })
        ).rejects.toThrow();
    });

    it('should complete task and accumulate fees', async () => {
        const taskId = 2001n;
        const payment = toNano('3');
        const feePct = 10n;
        const fee = (payment * feePct) / 100n;

        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'SetTaskDetails',
                taskId,
                paymentPerPerformerAmount: payment,
                numberOfPerformersNeeded: 1n,
                taskDescriptionHash: 10n,
                taskGoalHash: 20n,
                expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
                ziverFeePercentage: feePct,
                moderatorAddress: moderator.address,
                queryID: 21n,
            }
        });

        await taskPoster.send({
            to: escrowSM.address,
            value: payment + toNano('0.05'),
            body: { $$type: 'DepositFunds', taskId, queryID: 22n }
        });

        const performer1BalBefore = await performer1.getBalance();

        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'VerifyTaskCompletion',
                taskId,
                performerAddress: performer1.address,
                queryID: 23n,
            }
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

        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'SetTaskDetails',
                taskId,
                paymentPerPerformerAmount: payment,
                numberOfPerformersNeeded: nPerformers,
                taskDescriptionHash: 1n,
                taskGoalHash: 2n,
                expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
                ziverFeePercentage: 10n,
                moderatorAddress: moderator.address,
                queryID: 101n,
            }
        });

        await taskPoster.send({
            to: escrowSM.address,
            value: payment * nPerformers + toNano('0.05'),
            body: { $$type: 'DepositFunds', taskId, queryID: 102n }
        });

        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'VerifyTaskCompletion',
                taskId,
                performerAddress: performer1.address,
                queryID: 103n,
            }
        });

        let td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.PendingVerification);

        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'VerifyTaskCompletion',
                taskId,
                performerAddress: performer2.address,
                queryID: 104n,
            }
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

        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'SetTaskDetails',
                taskId,
                paymentPerPerformerAmount: payment,
                numberOfPerformersNeeded: 1n,
                taskDescriptionHash: 0n,
                taskGoalHash: 0n,
                expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
                ziverFeePercentage: feePct,
                moderatorAddress: moderator.address,
                queryID: 31n,
            }
        });
        await taskPoster.send({
            to: escrowSM.address,
            value: payment + toNano('0.05'),
            body: { $$type: 'DepositFunds', taskId, queryID: 32n }
        });
        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'VerifyTaskCompletion',
                taskId,
                performerAddress: performer1.address,
                queryID: 33n,
            }
        });
        expect(await escrowSM.getAccumulatedFees()).toEqual(fee);

        const treasuryBalBefore = await ziverTreasury.getBalance();
        await ziverTreasury.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: { $$type: 'WithdrawFee', queryID: 34n }
        });

        expect(await escrowSM.getAccumulatedFees()).toEqual(0n);
        const treasuryBalAfter = await ziverTreasury.getBalance();
        expect(treasuryBalAfter - treasuryBalBefore).toBeGreaterThan(fee - toNano('0.05'));
    });

    it('should handle disputes and moderator resolution (performer wins)', async () => {
        const taskId = 4001n;
        const payment = toNano('1');

        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'SetTaskDetails',
                taskId,
                paymentPerPerformerAmount: payment,
                numberOfPerformersNeeded: 1n,
                taskDescriptionHash: 0n,
                taskGoalHash: 0n,
                expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
                ziverFeePercentage: 5n,
                moderatorAddress: moderator.address,
                queryID: 41n,
            }
        });
        await taskPoster.send({
            to: escrowSM.address,
            value: payment + toNano('0.05'),
            body: { $$type: 'DepositFunds', taskId, queryID: 42n }
        });
        await performer1.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: { $$type: 'SubmitProof', taskId, proofHash: 123n, queryID: 43n }
        });
        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: { $$type: 'RaiseDispute', taskId, queryID: 44n }
        });
        let td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Disputed);

        await moderator.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'ResolveDispute',
                taskId,
                winnerAddress: performer1.address,
                queryID: 45n,
            }
        });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
    });

    it('should cancel and refund before activation', async () => {
        const taskId = 5001n;
        const payment = toNano('2');

        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'SetTaskDetails',
                taskId,
                paymentPerPerformerAmount: payment,
                numberOfPerformersNeeded: 1n,
                taskDescriptionHash: 0n,
                taskGoalHash: 0n,
                expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600),
                ziverFeePercentage: 2n,
                moderatorAddress: moderator.address,
                queryID: 51n,
            }
        });

        await taskPoster.send({
            to: escrowSM.address,
            value: payment / 2n + toNano('0.05'),
            body: { $$type: 'DepositFunds', taskId, queryID: 52n }
        });

        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: { $$type: 'CancelTaskAndRefund', taskId, queryID: 53n }
        });

        const td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Refunded);
        expect(td?.totalEscrowedFunds).toEqual(0n);
    });

    // --- Enhanced Security & Edge Case Tests ---

    it('should REJECT verification from a non-poster address', async () => {
        const taskId = 6001n;
        const payment = toNano('1');

        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: { $$type: 'SetTaskDetails', taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 1n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 5n, moderatorAddress: moderator.address, queryID: 61n } });
        await taskPoster.send({ to: escrowSM.address, value: payment + toNano('0.05'), body: { $$type: 'DepositFunds', taskId, queryID: 62n } });

        await expect(
            performer2.send({
                to: escrowSM.address,
                value: toNano('0.05'),
                body: {
                    $$type: 'VerifyTaskCompletion',
                    taskId,
                    performerAddress: performer1.address,
                    queryID: 63n,
                }
            })
        ).rejects.toThrow();
    });

    it('should REJECT fee withdrawal from a non-treasury address', async () => {
        const taskId = 7001n;
        const payment = toNano('1');

        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: { $$type: 'SetTaskDetails', taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 1n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 10n, moderatorAddress: moderator.address, queryID: 71n } });
        await taskPoster.send({ to: escrowSM.address, value: payment + toNano('0.05'), body: { $$type: 'DepositFunds', taskId, queryID: 72n } });
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: { $$type: 'VerifyTaskCompletion', taskId, performerAddress: performer1.address, queryID: 73n } });

        await expect(
            taskPoster.send({
                to: escrowSM.address,
                value: toNano('0.05'),
                body: { $$type: 'WithdrawFee', queryID: 74n }
            })
        ).rejects.toThrow();
    });

    it('should REJECT verifying an already completed performer', async () => {
        const taskId = 8001n;
        const payment = toNano('1');

        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: { $$type: 'SetTaskDetails', taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 2n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 5n, moderatorAddress: moderator.address, queryID: 81n } });
        await taskPoster.send({ to: escrowSM.address, value: payment * 2n + toNano('0.05'), body: { $$type: 'DepositFunds', taskId, queryID: 82n } });
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: { $$type: 'VerifyTaskCompletion', taskId, performerAddress: performer1.address, queryID: 83n } });

        await expect(
            taskPoster.send({
                to: escrowSM.address,
                value: toNano('0.05'),
                body: {
                    $$type: 'VerifyTaskCompletion',
                    taskId,
                    performerAddress: performer1.address,
                    queryID: 84n,
                }
            })
        ).rejects.toThrow();
    });

    it('should handle overpayment on deposit and refund the excess', async () => {
        const taskId = 9001n;
        const payment = toNano('5');

        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: { $$type: 'SetTaskDetails', taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 1n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 5n, moderatorAddress: moderator.address, queryID: 91n } });

        const posterBalanceBefore = await taskPoster.getBalance();
        const overpaymentAmount = toNano('2');

        await taskPoster.send({
            to: escrowSM.address,
            value: payment + overpaymentAmount + toNano('0.05'),
            body: { $$type: 'DepositFunds', taskId, queryID: 92n }
        });

        const posterBalanceAfter = await taskPoster.getBalance();
        const maxExpectedCost = payment + toNano('0.05');

        expect(posterBalanceBefore - posterBalanceAfter).toBeLessThan(maxExpectedCost + overpaymentAmount);
        expect(posterBalanceBefore - posterBalanceAfter).toBeGreaterThan(maxExpectedCost - toNano('0.01'));

        const td = await escrowSM.getTaskDetails(taskId);
        expect(td?.totalEscrowedFunds).toEqual(payment);
    });

    it('should handle dispute resolution where the poster wins', async () => {
        const taskId = 4002n;
        const payment = toNano('1');

        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: { $$type: 'SetTaskDetails', taskId, paymentPerPerformerAmount: payment, numberOfPerformersNeeded: 1n, expiryTimestamp: BigInt(Math.floor(Date.now() / 1000) + 3600), ziverFeePercentage: 5n, moderatorAddress: moderator.address, queryID: 91n } });
        await taskPoster.send({ to: escrowSM.address, value: payment + toNano('0.05'), body: { $$type: 'DepositFunds', taskId, queryID: 92n } });
        await performer1.send({ to: escrowSM.address, value: toNano('0.05'), body: { $$type: 'SubmitProof', taskId, proofHash: 123n, queryID: 93n } });
        await taskPoster.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: { $$type: 'RaiseDispute', taskId, queryID: 94n }
        });

        const posterBalanceBefore = await taskPoster.getBalance();

        await moderator.send({
            to: escrowSM.address,
            value: toNano('0.05'),
            body: {
                $$type: 'ResolveDispute',
                taskId,
                winnerAddress: taskPoster.address,
                queryID: 95n,
            }
        });

        const td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
        expect(td?.totalEscrowedFunds).toEqual(0n);

        const posterBalanceAfter = await taskPoster.getBalance();
        expect(posterBalanceAfter).toBeGreaterThan(posterBalanceBefore);
    });
});
