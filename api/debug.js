const forge = require('node-forge');

const DES_KEY = '38346591';

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { url } = req.query;

    if (!url) {
        return res.json({
            success: false,
            error: 'Pass ?url=ENCRYPTED_URL',
            example: '/api/debug?url=ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyeuX%2Bf93nTBLVq6TQ1xldOoA7pZceEt8tTOKDEO3zGGZqnta5xlX8fhw7tS9a8Gtq'
        });
    }

    const steps = [];

    try {
        let cleanUrl = url.trim();
        steps.push({ step: '1. Input', value: cleanUrl, length: cleanUrl.length });

        // Fix padding
        while (cleanUrl.length % 4 !== 0) {
            cleanUrl += '=';
        }
        steps.push({ step: '2. After padding', value: cleanUrl, length: cleanUrl.length });

        // Base64 decode
        const encrypted = forge.util.decode64(cleanUrl);
        steps.push({ step: '3. Base64 decoded', byteLength: encrypted.length, multipleOf8: encrypted.length % 8 === 0 });

        // DES decrypt
        const decipher = forge.cipher.createDecipher('DES-ECB', DES_KEY);
        decipher.start();
        decipher.update(forge.util.createBuffer(encrypted));
        const success = decipher.finish();

        steps.push({ step: '4. DES decrypt success', value: success });

        if (success) {
            const decrypted = decipher.output.toString('utf8');
            steps.push({ step: '5. Decrypted URL', value: decrypted });

            const downloadUrl = ['12', '48', '96', '160', '320'].map(q => ({
                quality: q + 'kbps',
                link: decrypted
                    .replace(/_\d+\.mp4/, `_${q}.mp4`)
                    .replace(/_\d+\.m4a/, `_${q}.m4a`)
            }));

            return res.json({
                success: true,
                decryptedUrl: decrypted,
                downloadUrl: downloadUrl,
                steps: steps
            });

        } else {
            return res.json({ success: false, error: 'DES finish() failed', steps: steps });
        }

    } catch (e) {
        steps.push({ step: 'ERROR', message: e.message });
        return res.json({ success: false, error: e.message, steps: steps });
    }
};