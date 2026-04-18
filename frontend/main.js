document.addEventListener("DOMContentLoaded", () => {
    // Metro UI Staggered Entrance Animation
    const tiles = document.querySelectorAll('.tile');
    
    // Shuffle the array to make the pop-in feel more organic and less linear
    const shuffledTiles = Array.from(tiles).sort(() => 0.5 - Math.random());
    
    shuffledTiles.forEach((tile, index) => {
        // Add staggered delay to each tile
        tile.style.animationDelay = `${index * 0.1}s`;
    });
});

// Wallet Copy Function
window.copyWallet = function() {
    const dummyAddress = "0x1A2bC3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0";
    navigator.clipboard.writeText(dummyAddress).then(() => {
        alert("Wallet address copied to clipboard!");
    }).catch(err => {
        console.error("Could not copy text: ", err);
    });
};
