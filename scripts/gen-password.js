const { hashPassword } = require('../middleware/guard');

const password = process.argv[2];

if (!password) {
  console.log('Usage: node scripts/gen-password.js "<password>"');
  console.log('Prints a MANAGER_PASSWORD_HASH value to paste into .env');
  process.exit(1);
}

console.log(hashPassword(password));
