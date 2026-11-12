(function () {
    const root = document.documentElement;
    root.style.removeProperty('--bg-url');
    root.style.removeProperty('--motion-gradient');
    root.style.removeProperty('--solid-bg-color');
    root.style.removeProperty('--custom-bg-image');
    document.body.classList.remove(
        'shared-solid-background',
        'shared-custom-background',
        'solid-background',
        'motion-background',
        'custom-image-background'
    );
}());
