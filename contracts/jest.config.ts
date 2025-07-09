module.exports = {
    testEnvironment: '@ton/sandbox',
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest',
    },
    testRegex: '/tests/.*\\.(test|spec)?\\.(ts|tsx)$',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
