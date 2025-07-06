import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Cell, toNano, Address, Dictionary } from 'ton';
import { EscrowSM, EscrowSMData, Opcodes, TaskDetails, EscrowState } from '../wrappers/EscrowSM';
import '@ton-community/test-utils'; // for expect().to.be.calledWith, etc.

describe('EscrowSM', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let escrowSM: SandboxContract<EscrowSM>;
    let ziverTreasury: Address; // This will be the actual Ziver treasury address
    let taskPoster: SandboxContract<TreasuryContract>;
    let performer1: SandboxContract<TreasuryContract>;
    let performer2: SandboxContract<TreasuryContract>;
    let moderator: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        // Define Ziver Treasury Address (the one you provided)
        ziverTreasury = Address.parse('UQDl_5CtQqwxSKk9EoUbgKV6XsSDQqqkYYeZ0UFduTZuCtlP');

        // Initialize contract data with an empty tasks dictionary and 0 fees
        const initialData: EscrowSMData = {
            tasks: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
            ziverTreasuryAddress: ziverTreasury,
        };

        escrowSM = blockchain.openContract(await EscrowSM.fromInit(initialData));

        const deployResult = await escrowSM.send(
            deployer.getSender(),
            {
                value: toNano('0.05'), // send some Toncoins to cover gas fees for deployment
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowSM.address,
            deploy: true,
            success: true,
        });

        // Set up other test accounts
        taskPoster = await blockchain.treasury('taskPoster');
        performer1 = await blockchain.treasury('performer1');
        performer2 = await blockchain.treasury('performer2');
        moderator = await blockchain.treasury('moderator');
    });

    it('should deploy and have correct initial data', async () => {
        // Check if getters return initial values
        const currentZiverTreasuryAddress = await escrowSM.getZiverTreasuryAddress();
        expect(currentZiverTreasuryAddress.toString()).toEqual(ziverTreasury.toString());

        const accumulatedFees = await escrowSM.getAccumulatedFees();
        expect(accumulatedFees).toEqual(0n); // Expect 0n (BigInt zero)
    });

    it('should allow a user to send task details', async () => {
        const taskId = 123n;
        const paymentPerPerformer = toNano('1'); // 1 TON
        const numberOfPerformers = 2;
        const taskDescriptionHash = 12345n; // Mock hash
        const taskGoalHash = 67890n; // Mock hash
        const expiryTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
        const ziverFeePercentage = 5; // 5% fee

        const sendTaskDetailsResult = await escrowSM.send(
            taskPoster.getSender(),
            {
                value: toNano('0.1'), // Message value to cover gas
            },
            {
                $$type: 'SendTaskDetails',
                queryId: 1n,
                taskId: taskId,
                paymentPerPerformerAmount: paymentPerPerformer,
                numberOfPerformersNeeded: BigInt(numberOfPerformers),
                taskDescriptionHash: taskDescriptionHash,
                taskGoalHash: taskGoalHash,
                expiryTimestamp: expiryTimestamp,
                ziverFeePercentage: BigInt(ziverFeePercentage),
                moderatorAddress: moderator.address,
            },
        );

        expect(sendTaskDetailsResult.transactions).toHaveTransaction({
            from: taskPoster.address,
            to: escrowSM.address,
            success: true,
            outMessagesCount: 1, // Expect a confirmation message back
        });

        const taskDetails = await escrowSM.getTaskDetails(taskId);
        expect(taskDetails).not.toBeNull();
        expect(taskDetails?.taskPosterAddress.toString()).toEqual(taskPoster.address.toString());
        expect(taskDetails?.paymentPerPerformerAmount).toEqual(paymentPerPerformer);
        expect(taskDetails?.numberOfPerformersNeeded).toEqual(BigInt(numberOfPerformers));
        expect(taskDetails?.totalEscrowedFunds).toEqual(0n); // No funds yet
        expect(taskDetails?.currentState).toEqual(BigInt(EscrowState.Idle)); // Should be Idle initially
        expect(taskDetails?.ziverFeePercentage).toEqual(BigInt(ziverFeePercentage));
    });

    it('should allow task poster to deposit funds for an existing task', async () => {
        const taskId = 123n;
        const paymentPerPerformer = toNano('1'); // 1 TON
        const numberOfPerformers = 2;
        const taskDescriptionHash = 12345n;
        const taskGoalHash = 67890n;
        const expiryTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
        const ziverFeePercentage = 5;

        // First, create the task
        await escrowSM.send(
            taskPoster.getSender(),
            { value: toNano('0.1') },
            {
                $$type: 'SendTaskDetails',
                queryId: 1n,
                taskId: taskId,
                paymentPerPerformerAmount: paymentPerPerformer,
                numberOfPerformersNeeded: BigInt(numberOfPerformers),
                taskDescriptionHash: taskDescriptionHash,
                taskGoalHash: taskGoalHash,
                expiryTimestamp: expiryTimestamp,
                ziverFeePercentage: BigInt(ziverFeePercentage),
                moderatorAddress: moderator.address,
            },
        );

        let taskDetailsBeforeDeposit = await escrowSM.getTaskDetails(taskId);
        expect(taskDetailsBeforeDeposit?.totalEscrowedFunds).toEqual(0n);
        expect(taskDetailsBeforeDeposit?.currentState).toEqual(BigInt(EscrowState.Idle));

        // Deposit half the required funds
        const depositAmount1 = paymentPerPerformer; // Funds for 1 performer
        const depositResult1 = await escrowSM.send(
            taskPoster.getSender(),
            {
                value: depositAmount1 + toNano('0.05'), // Funds + gas
            },
            {
                $$type: 'DepositFunds',
                queryId: 2n,
                taskId: taskId,
            },
        );

        expect(depositResult1.transactions).toHaveTransaction({
            from: taskPoster.address,
            to: escrowSM.address,
            success: true,
        });

        let taskDetailsAfterDeposit1 = await escrowSM.getTaskDetails(taskId);
        expect(taskDetailsAfterDeposit1?.totalEscrowedFunds).toEqual(depositAmount1);
        expect(taskDetailsAfterDeposit1?.currentState).toEqual(BigInt(EscrowState.TaskSetAndFundsPending)); // Should be pending

        // Deposit remaining funds
        const depositAmount2 = paymentPerPerformer; // Funds for 1 performer
        const depositResult2 = await escrowSM.send(
            taskPoster.getSender(),
            {
                value: depositAmount2 + toNano('0.05'), // Funds + gas
            },
            {
                $$type: 'DepositFunds',
                queryId: 3n,
                taskId: taskId,
            },
        );

        expect(depositResult2.transactions).toHaveTransaction({
            from: taskPoster.address,
            to: escrowSM.address,
            success: true,
        });

        let taskDetailsAfterDeposit2 = await escrowSM.getTaskDetails(taskId);
        expect(taskDetailsAfterDeposit2?.totalEscrowedFunds).toEqual(paymentPerPerformer * BigInt(numberOfPerformers));
        expect(taskDetailsAfterDeposit2?.currentState).toEqual(BigInt(EscrowState.Active)); // Should be Active now

        // Check overpayment refund
        const overpaymentAmount = toNano('0.5');
        const depositOverpayResult = await escrowSM.send(
            taskPoster.getSender(),
            {
                value: toNano('0.1') + overpaymentAmount, // Small amount + overpayment
            },
            {
                $$type: 'DepositFunds',
                queryId: 4n,
                taskId: taskId, // This will throw an error as it's already active and fully funded
            },
        );
        expect(depositOverpayResult.transactions).toHaveTransaction({
            from: taskPoster.address,
            to: escrowSM.address,
            success: false, // Should fail as task is already funded
            exitCode: 104, // error::invalid_state
        });
    });

    it('should allow task poster to verify task completion and pay performer, collecting fees', async () => {
        const taskId = 456n;
        const paymentPerPerformer = toNano('1'); // 1 TON
        const numberOfPerformers = 1; // For simplicity, one performer
        const taskDescriptionHash = 111n;
        const taskGoalHash = 222n;
        const expiryTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
        const ziverFeePercentage = 10; // 10% fee

        // 1. Create the task
        await escrowSM.send(
            taskPoster.getSender(),
            { value: toNano('0.1') },
            {
                $$type: 'SendTaskDetails',
                queryId: 1n,
                taskId: taskId,
                paymentPerPerformerAmount: paymentPerPerformer,
                numberOfPerformersNeeded: BigInt(numberOfPerformers),
                taskDescriptionHash: taskDescriptionHash,
                taskGoalHash: taskGoalHash,
                expiryTimestamp: expiryTimestamp,
                ziverFeePercentage: BigInt(ziverFeePercentage),
                moderatorAddress: moderator.address,
            },
        );

        // 2. Deposit required funds
        const totalRequiredFunds = paymentPerPerformer * BigInt(numberOfPerformers);
        await escrowSM.send(
            taskPoster.getSender(),
            { value: totalRequiredFunds + toNano('0.05') },
            {
                $$type: 'DepositFunds',
                queryId: 2n,
                taskId: taskId,
            },
        );

        let initialZiverFees = await escrowSM.getAccumulatedFees();
        expect(initialZiverFees).toEqual(0n);

        let performer1BalanceBefore = await performer1.getBalance();
        let contractBalanceBefore = await escrowSM.getBalance();

        // 3. Verify task completion for performer1
        const verifyResult = await escrowSM.send(
            taskPoster.getSender(),
            { value: toNano('0.1') }, // Gas for transaction
            {
                $$type: 'VerifyTaskCompletion',
                queryId: 3n,
                taskId: taskId,
                performerAddress: performer1.address,
            },
        );

        expect(verifyResult.transactions).toHaveTransaction({
            from: taskPoster.address,
            to: escrowSM.address,
            success: true,
        });
        expect(verifyResult.transactions).toHaveTransaction({
            from: escrowSM.address,
            to: performer1.address,
            success: true,
            // Check the amount sent to performer1 (payment - fee)
            value: paymentPerPerformer - (paymentPerPerformer * BigInt(ziverFeePercentage)) / 100n,
        });

        let taskDetailsAfterVerification = await escrowSM.getTaskDetails(taskId);
        expect(taskDetailsAfterVerification?.totalEscrowedFunds).toEqual(0n); // All funds for this task should be gone
        expect(taskDetailsAfterVerification?.currentState).toEqual(BigInt(EscrowState.Settled)); // Should be settled if 1 performer needed

        let accumulatedFeesAfter = await escrowSM.getAccumulatedFees();
        const expectedFee = (paymentPerPerformer * BigInt(ziverFeePercentage)) / 100n;
        expect(accumulatedFeesAfter).toEqual(expectedFee); // Verify fee accumulation

        let performer1BalanceAfter = await performer1.getBalance();
        // Check performer's balance increase (approx due to gas)
        expect(performer1BalanceAfter).toBeGreaterThan(performer1BalanceBefore);
        expect(performer1BalanceAfter - performer1BalanceBefore).toBeCloseTo(paymentPerPerformer - expectedFee, toNano('0.02').toString()); // Allow small gas variance
    });

    it('should allow ziver treasury to withdraw accumulated fees', async () => {
        const taskId1 = 789n;
        const taskId2 = 790n;
        const paymentPerPerformer = toNano('1'); // 1 TON
        const numberOfPerformers = 1;
        const ziverFeePercentage = 10; // 10% fee
        const expectedFee = (paymentPerPerformer * BigInt(ziverFeePercentage)) / 100n;

        // Simulate 2 tasks completing to accumulate fees
        // Task 1
        await escrowSM.send(taskPoster.getSender(), { value: toNano('0.1') }, { $$type: 'SendTaskDetails', queryId: 1n, taskId: taskId1, paymentPerPerformerAmount: paymentPerPerformer, numberOfPerformersNeeded: BigInt(numberOfPerformers), taskDescriptionHash: 1n, taskGoalHash: 1n, expiryTimestamp: BigInt(Date.now()), ziverFeePercentage: BigInt(ziverFeePercentage), moderatorAddress: moderator.address });
        await escrowSM.send(taskPoster.getSender(), { value: paymentPerPerformer + toNano('0.05') }, { $$type: 'DepositFunds', queryId: 2n, taskId: taskId1 });
        await escrowSM.send(taskPoster.getSender(), { value: toNano('0.1') }, { $$type: 'VerifyTaskCompletion', queryId: 3n, taskId: taskId1, performerAddress: performer1.address });

        // Task 2
        await escrowSM.send(taskPoster.getSender(), { value: toNano('0.1') }, { $$type: 'SendTaskDetails', queryId: 4n, taskId: taskId2, paymentPerPerformerAmount: paymentPerPerformer, numberOfPerformersNeeded: BigInt(numberOfPerformers), taskDescriptionHash: 2n, taskGoalHash: 2n, expiryTimestamp: BigInt(Date.now()), ziverFeePercentage: BigInt(ziverFeePercentage), moderatorAddress: moderator.address });
        await escrowSM.send(taskPoster.getSender(), { value: paymentPerPerformer + toNano('0.05') }, { $$type: 'DepositFunds', queryId: 5n, taskId: taskId2 });
        await escrowSM.send(taskPoster.getSender(), { value: toNano('0.1') }, { $$type: 'VerifyTaskCompletion', queryId: 6n, taskId: taskId2, performerAddress: performer2.address });

        let accumulatedFees = await escrowSM.getAccumulatedFees();
        expect(accumulatedFees).toEqual(expectedFee * 2n); // Two tasks completed

        let ziverTreasuryBalanceBefore = await blockchain.get}.getBalance(ziverTreasury);
        
        // Now, withdraw fees
        const withdrawResult = await escrowSM.send(
            blockchain.get andbox().getSender(ziverTreasury), // Use sandbox's sender for the treasury address
            {
                value: toNano('0.1'), // Gas for transaction
            },
            {
                $$type: 'WithdrawFee',
                queryId: 7n,
            },
        );

        expect(withdrawResult.transactions).toHaveTransaction({
            from: escrowSM.address,
            to: ziverTreasury,
            success: true,
            value: accumulatedFees, // Should send the full accumulated amount
        });

        let accumulatedFeesAfterWithdraw = await escrowSM.getAccumulatedFees();
        expect(accumulatedFeesAfterWithdraw).toEqual(0n); // Fees should be reset to 0

        let ziverTreasuryBalanceAfter = await blockchain.get}.getBalance(ziverTreasury);
        expect(ziverTreasuryBalanceAfter).toBeGreaterThan(ziverTreasuryBalanceBefore);
        expect(ziverTreasuryBalanceAfter - ziverTreasuryBalanceBefore).toBeCloseTo(accumulatedFees, toNano('0.02').toString()); // Allow small gas variance
    });

    // TODO: Add more tests for other opcodes (submitProof, raiseDispute, resolveDispute, cancelTaskAndRefund, etc.)
    // These will involve more complex scenarios and state transitions.
});
