const forge = require('node-forge');

const DES_KEY = '38346591';
const QUALITIES = ['12', '48', '96', '160', '320'];

function decryptUrl(encryptedUrl) {
    if (!encryptedUrl) return null;

    try {
        let cleanUrl = encryptedUrl.trim();
        while (cleanUrl.length % 4 !== 0) {
            cleanUrl += '=';
        }

        const encrypted = forge.util.decode64(cleanUrl);
        const decipher = forge.cipher.createDecipher('DES-ECB', DES_KEY);
        decipher.start();
        decipher.update(forge.util.createBuffer(encrypted));
        const success = decipher.finish();

        if (!success) return null;
        return decipher.output.toString('utf8');

    } catch (e) {
        return null;
    }
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { url } = req.query;
    if (!url) return res.status(400).json({ success: false, error: 'Missing ?url=' });

    const decrypted = decryptUrl(url);
    if (!decrypted) return res.status(400).json({ success: false, error: 'Decryption failed' });

    const downloadUrl = QUALITIES.map(q => ({
        quality: q + 'kbps',
        link: decrypted
            .replace(/_\d+\.mp4/, `_${q}.mp4`)
            .replace(/_\d+\.m4a/, `_${q}.m4a`)
    }));

    return res.json({
        success: true,
        decryptedUrl: decrypted,
        downloadUrl: downloadUrl
    });
};