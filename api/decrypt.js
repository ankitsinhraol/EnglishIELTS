const crypto = require('crypto');

const DES_KEY = Buffer.from('38346591', 'utf8');
const QUALITIES = ['12', '48', '96', '160', '320'];

function decryptUrl(encryptedUrl) {
    if (!encryptedUrl) return null;
    try {
        const encrypted = Buffer.from(encryptedUrl, 'base64');
        const decipher = crypto.createDecipheriv('des-ecb', DES_KEY, null);
        decipher.setAutoPadding(true);
        let decrypted = decipher.update(encrypted, null, 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
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
        link: decrypted.replace('_96.mp4', `_${q}.mp4`)
                       .replace('_96.m4a', `_${q}.m4a`)
    }));

    return res.json({
        success: true,
        decryptedUrl: decrypted,
        downloadUrl: downloadUrl
    });
};