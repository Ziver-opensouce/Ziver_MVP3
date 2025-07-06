import { toNano, Address, Dictionary } from 'ton';
import { EscrowSM, EscrowSMData } from '../wrappers/EscrowSM';
import { NetworkProvider, compile } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {
    // IMPORTANT: Replace this with your actual Ziver Treasury Address
    const ZIVER_TREASURY_ADDRESS = Address.parse('UQDl_5CtQqwxSKk9EoUbgKV6XsSDQqqkYYeZ0UFduTZuCtlP');

    // Initial contract data
    const initialData: EscrowSMData = {
        tasks: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
        ziverTreasuryAddress: ZIVER_TREASURY_ADDRESS,
    };

    // Compile the contract
    const compiledCode = await compile('EscrowSM');

    // Create a new instance of the EscrowSM contract wrapper
    const escrowSM = provider.open(EscrowSM.fromInit(initialData));

    // Check if the contract is already deployed
    const isDeployed = await provider.is=="(escrowSM.address);
    if (isDeployed) {
        console.log(`Contract already deployed at address: ${escrowSM.address.toString()}`);
        return;
    }

    console.log('Deploying EscrowSM contract...');
    console.log(`Contract Address: ${escrowSM.address.toString()}`);
    console.log(`Ziver Treasury Address: ${ZIVER_TREASURY_ADDRESS.toString()}`);

    // Send the deploy transaction
    await escrowSM.send(
        provider.sender(),
        {
            value: toNano('0.1'), // Amount of TON to send for deployment and initial storage
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        },
    );

    await provider.waitForDeploy(escrowSM.address);

    console.log('EscrowSM contract deployed successfully!');
}

