import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core'; // Import beginCell
import { TimedReleaseVault } from '../wrappers/TimedReleaseVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('TimedReleaseVault', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('TimedReleaseVault');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let timedReleaseVault: SandboxContract<TimedReleaseVault>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        timedReleaseVault = blockchain.openContract(TimedReleaseVault.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        // Define the initial data for the contract
        const initialOpcode = 1; // As expected by your FunC contract for initialization
        const initialReleaseTimestamp = Math.floor(Date.now() / 1000) + 60; // Example: 60 seconds from now

        // Create the message body with the expected initial data
        const deployBody = beginCell()
            .storeUint(initialOpcode, 32)
            .storeUint(initialReleaseTimestamp, 64)
            .endCell();

        const deployResult = await timedReleaseVault.sendDeploy(deployer.getSender(), toNano('0.05'), deployBody); // Pass the deployBody

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: timedReleaseVault.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // Now you can also add assertions to check the initial state after deployment
        const { owner_address, release_timestamp, is_released } = await timedReleaseVault.getContractData(); // Assuming your wrapper has this helper
        expect(owner_address.equals(deployer.address)).toBe(true);
        expect(release_timestamp).toBe(initialReleaseTimestamp);
        expect(is_released).toBe(0);
    });

    // Add more test cases here for deposit, release, etc.
});
