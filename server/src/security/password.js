import crypto from 'crypto';
import argon2 from 'argon2';

const DB_PEPPER = process.env.DB_PEPPER || '';

function pepperedHmacSha256(plainPassword) {
    return crypto
        .createHmac('sha256', DB_PEPPER)
        .update(String(plainPassword))
        .digest('hex');
}

export async function hashPassword(plainPassword) {
    const preHashed = pepperedHmacSha256(plainPassword);
    return argon2.hash(preHashed, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3
    });
}

export async function verifyPassword(plainPassword, passwordHash) {
    const preHashed = pepperedHmacSha256(plainPassword);
    return argon2.verify(passwordHash, preHashed);
}
