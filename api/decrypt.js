const CryptoJS = require('crypto-js');
const DECRYPT_KEY = CryptoJS.enc.Utf8.parse('3834659127733675');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { url } = req.query;
    if (!url) return res.status(400).json({ success: false, error: 'Missing ?url=' });

    try {
        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(url) },
            DECRYPT_KEY,
            { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
        );
        const result = decrypted.toString(CryptoJS.enc.Utf8);
        if (!result) return res.status(400).json({ success: false, error: 'Decryption failed' });

        return res.json({
            success: true,
            decryptedUrl: result,
            allQualities: ['48', '96', '160', '320'].map(q => ({
                quality: q + 'kbps',
                url: result.replace(/_\d+\.mp4/, `_${q}.mp4`).replace(/_\d+\.m4a/, `_${q}.m4a`)
            }))
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Decryption failed' });
    }
};