import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
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

        const deployResult = await timedReleaseVault.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: timedReleaseVault.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and timedReleaseVault are ready to use
    });
});
