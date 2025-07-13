import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, Dictionary, toNano } from '@ton/core';
import { EscrowSM, EscrowSMData, Opcodes, EscrowState } from '../wrappers/EscrowSM';
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

        escrowSM = blockchain.openContract(await EscrowSM.createFromConfig(initialData, 0));

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

                const detailsCell = beginCell()
            .storeUint(taskId, 64)
            .storeCoins(payment)
            .storeUint(nPerformers, 32)
            .storeUint(123n, 256)
            .storeUint(456n, 256)
            .storeUint(expiry, 64)
            .storeUint(5n, 8)
            .storeAddress(moderator.address)
            .endCell();
            
        const setTaskBody = beginCell()
            .storeUint(Opcodes.setTaskDetails, 32)
            .storeUint(1n, 64) // queryID
            .storeRef(detailsCell)
            .endCell();

        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: setTaskBody });

        let td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.TaskSetAndFundsPending);

        const depositBody = beginCell().storeUint(Opcodes.depositFunds, 32).storeUint(2n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: payment + toNano('0.05'), body: depositBody });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.totalEscrowedFunds).toEqual(payment);
        expect(td?.currentState).toEqual(EscrowState.Active);

        blockchain.now = Number(expiry) + 1;

        const expireBody = beginCell().storeUint(Opcodes.expireTask, 32).storeUint(3n, 64).storeUint(taskId, 64).endCell();
        await performer1.send({ to: escrowSM.address, value: toNano('0.05'), body: expireBody });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Expired);
        expect(td?.totalEscrowedFunds).toEqual(0n);
    });

    it('should enforce replay protection (reject duplicate queryIDs)', async () => {
        const taskId = 1002n;
        const payment = toNano('1');
        const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

                const detailsCell = beginCell()
            .storeUint(taskId, 64).storeCoins(payment)
            .storeUint(1n, 32).storeUint(0n, 256).storeUint(0n, 256).storeUint(expiry, 64)
            .storeUint(5n, 8).storeAddress(moderator.address).endCell();

        const setTaskBody = beginCell()
            .storeUint(Opcodes.setTaskDetails, 32).storeUint(10n, 64).storeRef(detailsCell).endCell();

        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: setTaskBody });

        const depositBody = beginCell().storeUint(Opcodes.depositFunds, 32).storeUint(11n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: payment + toNano('0.05'), body: depositBody });

        // Try to send the same deposit transaction again
        await expect(
            taskPoster.send({ to: escrowSM.address, value: payment + toNano('0.05'), body: depositBody })
        ).rejects.toThrow();
    });

    it('should complete task and accumulate fees', async () => {
        const taskId = 2001n;
        const payment = toNano('3');
        const feePct = 10n;
        const fee = (payment * feePct) / 100n;

                const detailsCell = beginCell()
            .storeUint(taskId, 64).storeCoins(payment)
            .storeUint(1n, 32).storeUint(10n, 256).storeUint(20n, 256).storeUint(BigInt(Math.floor(Date.now() / 1000) + 3600), 64)
            .storeUint(feePct, 8).storeAddress(moderator.address).endCell();

        const setTaskBody = beginCell()
            .storeUint(Opcodes.setTaskDetails, 32).storeUint(21n, 64).storeRef(detailsCell).endCell();

        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: setTaskBody });

        const depositBody = beginCell().storeUint(Opcodes.depositFunds, 32).storeUint(22n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: payment + toNano('0.05'), body: depositBody });

        const performer1BalBefore = await performer1.getBalance();

        const verifyBody = beginCell()
            .storeUint(Opcodes.verifyTaskCompletion, 32).storeUint(23n, 64).storeUint(taskId, 64)
            .storeAddress(performer1.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: verifyBody });

        const performer1BalAfter = await performer1.getBalance();
        const expectedPayout = payment - fee;
        expect(performer1BalAfter - performer1BalBefore).toBeGreaterThan(expectedPayout - toNano('0.05'));
        expect(await escrowSM.getAccumulatedFees()).toEqual(fee);
    });

    it('should handle multiple performers and settle correctly', async () => {
        const taskId = 2022n;
        const payment = toNano('1');
        const nPerformers = 2n;

                const detailsCell = beginCell()
            .storeUint(taskId, 64).storeCoins(payment)
            .storeUint(nPerformers, 32).storeUint(1n, 256).storeUint(2n, 256).storeUint(BigInt(Math.floor(Date.now() / 1000) + 3600), 64)
            .storeUint(10n, 8).storeAddress(moderator.address).endCell();
            
        const setTaskBody = beginCell()
            .storeUint(Opcodes.setTaskDetails, 32).storeUint(101n, 64).storeRef(detailsCell).endCell();

        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: setTaskBody });

        const depositBody = beginCell().storeUint(Opcodes.depositFunds, 32).storeUint(102n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: payment * nPerformers + toNano('0.05'), body: depositBody });

        const verifyBody1 = beginCell()
            .storeUint(Opcodes.verifyTaskCompletion, 32).storeUint(103n, 64).storeUint(taskId, 64)
            .storeAddress(performer1.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: verifyBody1 });

        let td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.PendingVerification);

        const verifyBody2 = beginCell()
            .storeUint(Opcodes.verifyTaskCompletion, 32).storeUint(104n, 64).storeUint(taskId, 64)
            .storeAddress(performer2.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: verifyBody2 });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
        expect(td?.totalEscrowedFunds).toEqual(0n);
    });

    it('should allow treasury to withdraw accumulated fees', async () => {
        const taskId = 3001n;
        const payment = toNano('1');
        const feePct = 10n;
        const fee = (payment * feePct) / 100n;

                const detailsCell = beginCell()
            .storeUint(taskId, 64).storeCoins(payment)
            .storeUint(1n, 32).storeUint(0n, 256).storeUint(0n, 256).storeUint(BigInt(Math.floor(Date.now() / 1000) + 3600), 64)
            .storeUint(feePct, 8).storeAddress(moderator.address).endCell();
            
        const setTaskBody = beginCell()
            .storeUint(Opcodes.setTaskDetails, 32).storeUint(31n, 64).storeRef(detailsCell).endCell();

        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: setTaskBody });

        const depositBody = beginCell().storeUint(Opcodes.depositFunds, 32).storeUint(32n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: payment + toNano('0.05'), body: depositBody });

        const verifyBody = beginCell()
            .storeUint(Opcodes.verifyTaskCompletion, 32).storeUint(33n, 64).storeUint(taskId, 64)
            .storeAddress(performer1.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: verifyBody });
        expect(await escrowSM.getAccumulatedFees()).toEqual(fee);

        const treasuryBalBefore = await ziverTreasury.getBalance();
        const withdrawBody = beginCell().storeUint(Opcodes.withdrawFee, 32).storeUint(34n, 64).endCell();
        await ziverTreasury.send({ to: escrowSM.address, value: toNano('0.05'), body: withdrawBody });

        expect(await escrowSM.getAccumulatedFees()).toEqual(0n);
        const treasuryBalAfter = await ziverTreasury.getBalance();
        expect(treasuryBalAfter - treasuryBalBefore).toBeGreaterThan(fee - toNano('0.05'));
    });

    it('should handle disputes and moderator resolution (performer wins)', async () => {
        const taskId = 4001n;
        const payment = toNano('1');

        const setTaskBody = beginCell()
            .storeUint(Opcodes.setTaskDetails, 32).storeUint(41n, 64).storeUint(taskId, 64).storeCoins(payment) // CORRECTED
            .storeUint(1n, 32).storeUint(0n, 256).storeUint(0n, 256).storeUint(BigInt(Math.floor(Date.now() / 1000) + 3600), 64) // CORRECTED
            .storeUint(5n, 8).storeAddress(moderator.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: setTaskBody });

        const depositBody = beginCell().storeUint(Opcodes.depositFunds, 32).storeUint(42n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: payment + toNano('0.05'), body: depositBody });

        const submitProofBody = beginCell().storeUint(Opcodes.submitProof, 32).storeUint(43n, 64).storeUint(taskId, 64).storeUint(123n, 256).endCell();
        await performer1.send({ to: escrowSM.address, value: toNano('0.05'), body: submitProofBody });

        const raiseDisputeBody = beginCell().storeUint(Opcodes.raiseDispute, 32).storeUint(44n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: raiseDisputeBody });

        let td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Disputed);

        const resolveBody = beginCell()
            .storeUint(Opcodes.resolveDispute, 32).storeUint(45n, 64).storeUint(taskId, 64)
            .storeAddress(performer1.address).endCell();
        await moderator.send({ to: escrowSM.address, value: toNano('0.05'), body: resolveBody });

        td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
    });

    it('should cancel and refund before activation', async () => {
        const taskId = 5001n;
        const payment = toNano('2');

        const setTaskBody = beginCell()
            .storeUint(Opcodes.setTaskDetails, 32).storeUint(51n, 64).storeUint(taskId, 64).storeCoins(payment) // CORRECTED
            .storeUint(1n, 32).storeUint(0n, 256).storeUint(0n, 256).storeUint(BigInt(Math.floor(Date.now() / 1000) + 3600), 64) // CORRECTED
            .storeUint(2n, 8).storeAddress(moderator.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: setTaskBody });

        const depositBody = beginCell().storeUint(Opcodes.depositFunds, 32).storeUint(52n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: payment / 2n + toNano('0.05'), body: depositBody });

        const cancelBody = beginCell().storeUint(Opcodes.cancelTaskAndRefund, 32).storeUint(53n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: cancelBody });

        const td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Refunded);
        expect(td?.totalEscrowedFunds).toEqual(0n);
    });

    // --- Enhanced Security & Edge Case Tests ---

    it('should REJECT verification from a non-poster address', async () => {
        const taskId = 6001n;
        const payment = toNano('1');

        const setTaskBody = beginCell()
            .storeUint(Opcodes.setTaskDetails, 32).storeUint(61n, 64).storeUint(taskId, 64).storeCoins(payment) // CORRECTED
            .storeUint(1n, 32).storeUint(0n, 256).storeUint(0n, 256).storeUint(BigInt(Math.floor(Date.now() / 1000) + 3600), 64) // CORRECTED
            .storeUint(5n, 8).storeAddress(moderator.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: setTaskBody });

        const depositBody = beginCell().storeUint(Opcodes.depositFunds, 32).storeUint(62n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: payment + toNano('0.05'), body: depositBody });

        const verifyBody = beginCell()
            .storeUint(Opcodes.verifyTaskCompletion, 32).storeUint(63n, 64).storeUint(taskId, 64)
            .storeAddress(performer1.address).endCell();

        // Attempt verification from an unauthorized address
        await expect(
            performer2.send({ to: escrowSM.address, value: toNano('0.05'), body: verifyBody })
        ).rejects.toThrow();
    });

    it('should REJECT fee withdrawal from a non-treasury address', async () => {
        const taskId = 7001n;
        const payment = toNano('1');

        const setTaskBody = beginCell()
            .storeUint(Opcodes.setTaskDetails, 32).storeUint(71n, 64).storeUint(taskId, 64).storeCoins(payment) // CORRECTED
            .storeUint(1n, 32).storeUint(0n, 256).storeUint(0n, 256).storeUint(BigInt(Math.floor(Date.now() / 1000) + 3600), 64) // CORRECTED
            .storeUint(10n, 8).storeAddress(moderator.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: setTaskBody });

        const depositBody = beginCell().storeUint(Opcodes.depositFunds, 32).storeUint(72n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: payment + toNano('0.05'), body: depositBody });

        const verifyBody = beginCell()
            .storeUint(Opcodes.verifyTaskCompletion, 32).storeUint(73n, 64).storeUint(taskId, 64)
            .storeAddress(performer1.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: verifyBody });

        const withdrawBody = beginCell().storeUint(Opcodes.withdrawFee, 32).storeUint(74n, 64).endCell();

        // Attempt withdrawal from an unauthorized address
        await expect(
            taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: withdrawBody })
        ).rejects.toThrow();
    });

    it('should REJECT verifying an already completed performer', async () => {
        const taskId = 8001n;
        const payment = toNano('1');

        const setTaskBody = beginCell()
            .storeUint(Opcodes.setTaskDetails, 32).storeUint(81n, 64).storeUint(taskId, 64).storeCoins(payment) // CORRECTED
            .storeUint(2n, 32).storeUint(0n, 256).storeUint(0n, 256).storeUint(BigInt(Math.floor(Date.now() / 1000) + 3600), 64) // CORRECTED
            .storeUint(5n, 8).storeAddress(moderator.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: setTaskBody });

        const depositBody = beginCell().storeUint(Opcodes.depositFunds, 32).storeUint(82n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: payment * 2n + toNano('0.05'), body: depositBody });

        const verifyBody = beginCell()
            .storeUint(Opcodes.verifyTaskCompletion, 32).storeUint(83n, 64).storeUint(taskId, 64)
            .storeAddress(performer1.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: verifyBody });

        // Attempt to verify the same performer again
        const verifyBodyAgain = beginCell()
            .storeUint(Opcodes.verifyTaskCompletion, 32).storeUint(84n, 64).storeUint(taskId, 64)
            .storeAddress(performer1.address).endCell();

        await expect(
            taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: verifyBodyAgain })
        ).rejects.toThrow();
    });

    it('should handle overpayment on deposit and refund the excess', async () => {
        const taskId = 9001n;
        const payment = toNano('5');

        const setTaskBody = beginCell()
            .storeUint(Opcodes.setTaskDetails, 32).storeUint(91n, 64).storeUint(taskId, 64).storeCoins(payment) // CORRECTED
            .storeUint(1n, 32).storeUint(0n, 256).storeUint(0n, 256).storeUint(BigInt(Math.floor(Date.now() / 1000) + 3600), 64) // CORRECTED
            .storeUint(5n, 8).storeAddress(moderator.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: setTaskBody });

        const posterBalanceBefore = await taskPoster.getBalance();
        const overpaymentAmount = toNano('2');

        const depositBody = beginCell().storeUint(Opcodes.depositFunds, 32).storeUint(92n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({
            to: escrowSM.address,
            value: payment + overpaymentAmount + toNano('0.05'),
            body: depositBody
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

        const setTaskBody = beginCell()
            .storeUint(Opcodes.setTaskDetails, 32).storeUint(91n, 64).storeUint(taskId, 64).storeCoins(payment) // CORRECTED
            .storeUint(1n, 32).storeUint(0n, 256).storeUint(0n, 256).storeUint(BigInt(Math.floor(Date.now() / 1000) + 3600), 64) // CORRECTED
            .storeUint(5n, 8).storeAddress(moderator.address).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: setTaskBody });

        const depositBody = beginCell().storeUint(Opcodes.depositFunds, 32).storeUint(92n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: payment + toNano('0.05'), body: depositBody });

        const submitProofBody = beginCell().storeUint(Opcodes.submitProof, 32).storeUint(93n, 64).storeUint(taskId, 64).storeUint(123n, 256).endCell();
        await performer1.send({ to: escrowSM.address, value: toNano('0.05'), body: submitProofBody });

        const raiseDisputeBody = beginCell().storeUint(Opcodes.raiseDispute, 32).storeUint(94n, 64).storeUint(taskId, 64).endCell();
        await taskPoster.send({ to: escrowSM.address, value: toNano('0.05'), body: raiseDisputeBody });

        const posterBalanceBefore = await taskPoster.getBalance();

        const resolveBody = beginCell()
            .storeUint(Opcodes.resolveDispute, 32).storeUint(95n, 64).storeUint(taskId, 64)
            .storeAddress(taskPoster.address).endCell(); // Moderator resolves in favor of the poster
        await moderator.send({ to: escrowSM.address, value: toNano('0.05'), body: resolveBody });

        const td = await escrowSM.getTaskDetails(taskId);
        expect(td?.currentState).toEqual(EscrowState.Settled);
        expect(td?.totalEscrowedFunds).toEqual(0n);

        const posterBalanceAfter = await taskPoster.getBalance();
        // Poster's balance should increase as they get the refund
        expect(posterBalanceAfter).toBeGreaterThan(posterBalanceBefore);
    });
});
