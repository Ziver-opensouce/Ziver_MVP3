import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { EscrowSM } from '../wrappers/EscrowSM';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('EscrowSM', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('EscrowSM');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let escrowSM: SandboxContract<EscrowSM>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        escrowSM = blockchain.openContract(EscrowSM.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await escrowSM.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowSM.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and escrowSM are ready to use
    });
});
