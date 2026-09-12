(function () {
    const presets = {
        pinkBlue: 'linear-gradient(135deg, #ff3cac, #784ba0, #2b86c5)',
        orangeBlue: 'linear-gradient(135deg, #ff7a18, #ffb347, #2193b0)',
        mintPurple: 'linear-gradient(135deg, #43e97b, #38f9d7, #7f53ac)',
        peachSky: 'linear-gradient(135deg, #ff9a9e, #fad0c4, #a1c4fd)',
        candy: 'linear-gradient(135deg, #fbc2eb, #a6c1ee, #84fab0)',
        lavender: 'linear-gradient(135deg, #c471f5, #fa71cd, #12c2e9)',
        sunset: 'linear-gradient(135deg, #ee0979, #ff6a00, #ffd200)',
        skyNight: 'linear-gradient(135deg, #141e30, #243b55, #00c6ff)',
        solidBlue: '#2563eb',
        solidPink: '#ec4899',
        solidOrange: '#f97316',
        solidPurple: '#8b5cf6',
        solidGreen: '#10b981',
        solidBlack: '#000000'
    };

    function applySharedBackground() {
        const key = localStorage.getItem('appBackgroundPreset') || 'pinkBlue';
        const customImage = localStorage.getItem('customBackgroundImage');
        const value = presets[key] || presets.pinkBlue;
        const root = document.documentElement;
        root.style.setProperty('--bg-url', key === 'customImage' && customImage ? `url("${customImage}")` : value);
        root.style.setProperty('--motion-gradient', value);
        root.style.setProperty('--solid-bg-color', value);
        document.body.classList.toggle('shared-solid-background', key.indexOf('solid') === 0);
        document.body.classList.toggle('shared-custom-background', key === 'customImage' && Boolean(customImage));
    }

    const style = document.createElement('style');
    style.textContent = `
        body.shared-solid-background,
        body.shared-solid-background::before { background-image: none !important; background-color: var(--solid-bg-color) !important; }
        body.shared-custom-background::before { background: var(--bg-url) center center / cover no-repeat !important; }
    `;
    document.head.appendChild(style);
    window.addEventListener('load', applySharedBackground);
    applySharedBackground();
}());
