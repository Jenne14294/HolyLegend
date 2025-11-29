document.addEventListener('DOMContentLoaded', () => {
    const panels = document.querySelectorAll('.panel');

    panels.forEach(panel => {
        panel.addEventListener('click', () => {
            panels.forEach(p => p.classList.remove('active'));
            panel.classList.add('active');
            
            const role = panel.getAttribute('data-role');
            console.log(`RPG Role Selected: ${role}`);
        });

        // 電腦版滑鼠移入優化
        panel.addEventListener('mouseenter', () => {
             panels.forEach(p => p.classList.remove('active'));
        });
    });
});