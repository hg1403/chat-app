import * as openpgp from 'openpgp';

export const generateAndStorePGPKeys = async (passphrase = '') => {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'rsa',
    rsaBits: 2048,
    userIDs: [{ name: 'You', email: 'you@example.com' }],
    passphrase,
  });

  // Save keys and passphrase to localStorage
  localStorage.setItem('privateKey', privateKey);
  localStorage.setItem('publicKey', publicKey);
  localStorage.setItem('passphrase', passphrase);

  alert('PGP keys generated and saved!');
};
