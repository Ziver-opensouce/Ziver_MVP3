/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // Use the ts-jest preset to automatically handle TypeScript transformations.
  preset: 'ts-jest',

  // The testing environment. 'node' is correct for your use case.
  testEnvironment: 'node',

  // Keep your specific testMatch pattern to tell Jest where to find your tests.
  testMatch: [
    '<rootDir>/tests/**/*.spec.ts'
  ],
};
