const CryptoJS = require('crypto-js');

const DES_KEY = CryptoJS.enc.Utf8.parse('38346591');
const ZERO_IV = CryptoJS.enc.Utf8.parse('\0\0\0\0\0\0\0\0');

module.exports = async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    try {
        const encrypted = CryptoJS.enc.Base64.parse(url);
        const decrypted = CryptoJS.TripleDES.decrypt(
            { ciphertext: encrypted },
            DES_KEY,
            { iv: ZERO_IV, mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
        );
        let final_url = decrypted.toString(CryptoJS.enc.Utf8).replace('_96.mp4', '_320.mp4');

        const base = final_url.replace('_320.mp4', '');
        const qualities = ['12', '48', '96', '160', '320'].map(q => ({
            quality: q + 'kbps',
            link: base + '_' + q + '.mp4'
        }));

        res.json({
            success: true,
            decryptedUrl: final_url,
            downloadUrl: qualities
        });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Decryption failed' });
    }
};