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
