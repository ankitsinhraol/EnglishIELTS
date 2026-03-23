const crypto = require('crypto');

const DES_KEY = Buffer.from('38346591', 'utf8');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { url } = req.query;

    if (!url) {
        return res.json({
            success: false,
            error: 'Pass ?url=ENCRYPTED_URL to test decryption',
            example: '/api/debug?url=ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyeuX%2Bf93nTBLVq6TQ1xldOoA7pZceEt8tTOKDEO3zGGZqnta5xlX8fhw7tS9a8Gtq'
        });
    }

    const results = {
        input: url,
        inputLength: url.length,
        steps: []
    };

    // Step 1: Raw base64 decode
    try {
        let cleanUrl = url.trim();
        results.steps.push({ step: 'Clean URL', value: cleanUrl, length: cleanUrl.length });

        // Fix padding
        while (cleanUrl.length % 4 !== 0) {
            cleanUrl += '=';
        }
        results.steps.push({ step: 'After padding fix', value: cleanUrl, length: cleanUrl.length });

        // Base64 decode
        const buffer = Buffer.from(cleanUrl, 'base64');
        results.steps.push({ step: 'Base64 decoded', bufferLength: buffer.length, hex: buffer.toString('hex').substring(0, 60) });

        // Check if buffer length is multiple of 8 (DES block size)
        results.steps.push({ step: 'Buffer multiple of 8?', value: buffer.length % 8 === 0 });

        // DES decrypt
        const decipher = crypto.createDecipheriv('des-ecb', DES_KEY, null);
        decipher.setAutoPadding(true);

        let decrypted = decipher.update(buffer, null, 'utf8');
        decrypted += decipher.final('utf8');

        results.steps.push({ step: 'DES decrypted', value: decrypted });
        results.success = true;
        results.decryptedUrl = decrypted;

        // Generate all quality URLs
        results.downloadUrl = ['12', '48', '96', '160', '320'].map(q => ({
            quality: q + 'kbps',
            link: decrypted
                .replace(/_96\.mp4/, `_${q}.mp4`)
                .replace(/_96\.m4a/, `_${q}.m4a`)
        }));

    } catch (e) {
        results.success = false;
        results.error = e.message;
        results.steps.push({ step: 'ERROR', message: e.message });

        // Try URL decoding first
        try {
            const urlDecoded = decodeURIComponent(url);
            let cleanUrl = urlDecoded.trim();
            while (cleanUrl.length % 4 !== 0) {
                cleanUrl += '=';
            }

            const buffer = Buffer.from(cleanUrl, 'base64');
            const decipher = crypto.createDecipheriv('des-ecb', DES_KEY, null);
            decipher.setAutoPadding(true);

            let decrypted = decipher.update(buffer, null, 'utf8');
            decrypted += decipher.final('utf8');

            results.steps.push({ step: 'URL decoded + DES decrypted', value: decrypted });
            results.success = true;
            results.decryptedUrl = decrypted;
            results.note = 'Worked after URL decoding first';

            results.downloadUrl = ['12', '48', '96', '160', '320'].map(q => ({
                quality: q + 'kbps',
                link: decrypted
                    .replace(/_96\.mp4/, `_${q}.mp4`)
                    .replace(/_96\.m4a/, `_${q}.m4a`)
            }));

        } catch (e2) {
            results.steps.push({ step: 'URL decode attempt also failed', message: e2.message });
        }
    }

    return res.json(results);
};