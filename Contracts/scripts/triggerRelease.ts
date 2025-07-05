import { Address, toNano, beginCell } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { TimedReleaseVault } from '../wrappers/TimedReleaseVault'; // Import your wrapper

// Define the release opcode, must match FunC
const RELEASE_OPCODE = 0x4f728c77; // Ensure this matches op::release in your FunC contract

export async function run(provider: NetworkProvider) {
    // IMPORTANT: Replace with your deployed contract's address
    const contractAddress = Address.parse('YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE');
    const timedReleaseVault = provider.open(TimedReleaseVault.createFromAddress(contractAddress));

    console.log(`Attempting to trigger release for contract: ${contractAddress}`);

    // Build the message body for the release operation
    const releaseBody = beginCell()
        .storeUint(RELEASE_OPCODE, 32)
        .endCell();

    try {
        const sendResult = await timedReleaseVault.sendDeploy( // Reusing sendDeploy as it accepts body
            provider.sender(),
            toNano('0.01'), // Send a small amount for gas, remaining contract balance will be sent back
            releaseBody
        );

        console.log('Release transaction sent:', sendResult.transactions);

        // Optional: Wait for the transaction to be processed
        await provider.waitForDeploy(sendResult.transactions[0].to); // Wait for the outbound message from contract

        console.log('Release transaction processed.');

        // Verify funds returned to owner
        const contractData = await timedReleaseVault.getContractData();
        console.log(`Contract Balance after release attempt: ${await provider.getBalance(contractAddress)}`);
        console.log(`Is Released flag after release attempt: ${contractData.is_released}`);


    } catch (error) {
        console.error('Error triggering release:', error);
        console.log("Check if timestamp has passed or if you're the owner.");
    }
}
