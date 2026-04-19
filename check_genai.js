try {
    const genai = require('@google/genai');
    console.log('Exports from @google/genai:', Object.keys(genai));
} catch (e) {
    console.log('Error importing @google/genai:', e.message);
}
