import { useState } from 'react';
import { clear, get, set } from 'idb-keyval';
import { initializeKeys, initiateX3DH, encryptMessage, decryptMessage } from '../lib/signalCrypto';

function CryptoTestPage() {
  const [result, setResult] = useState('');

  async function runTest() {
    try {
      console.log('Starting test...');

      // Clear idb-keyval to ensure clean state
      await clear();
      console.log('idb-keyval cleared');

      // Initialize keys for Alice and Bob
      console.log('Initializing Alice keys...');
      const aliceKeys = await initializeKeys('alice');
      console.log('Alice keys:', aliceKeys);

      console.log('Initializing Bob keys...');
      const bobKeys = await initializeKeys('bob');
      console.log('Bob keys:', bobKeys);

      // Perform X3DH key agreement
      console.log('Alice initiating X3DH with Bob...');
      const aliceSharedKey = await initiateX3DH('alice', 'bob', bobKeys);
      console.log('Alice shared key:', !!aliceSharedKey);

      console.log('Bob initiating X3DH with Alice...');
      const bobSharedKey = await initiateX3DH('bob', 'alice', aliceKeys);
      console.log('Bob shared key:', !!bobSharedKey);

      // Test encryption and decryption
      const message = 'Hello, Bob!';
      console.log('Encrypting message:', message);
      const encrypted = await encryptMessage('alice', 'bob', message);
      console.log('Encrypted:', encrypted);

      console.log('Decrypting message...');
      const decrypted = await decryptMessage('bob', 'alice', encrypted);
      console.log('Decrypted:', decrypted);

      if (decrypted === message) {
        console.log('✅ Message decrypted correctly');
        setResult('Test passed: Message decrypted correctly');
      } else {
        console.error('❌ Decryption failed: mismatch');
        setResult('Test failed: Decryption mismatch');
      }
    } catch (error) {
      console.error('Test failed:', error);
      setResult(`Test failed: ${error.message}`);
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Crypto Test</h1>
      <button
        onClick={runTest}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Run Test
      </button>
      <p className="mt-4">{result}</p>
    </div>
  );
}

export default CryptoTestPage;