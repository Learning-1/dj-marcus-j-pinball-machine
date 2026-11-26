;(() => {
    const entry = document.currentScript?.src;
    if (!entry || window.__djMarcusJPinballLoader) return;
    window.__djMarcusJPinballLoader = true;

    async function start() {
        const manifestUrl = new URL("latest.json", entry);
        const response = await fetch(manifestUrl, {cache:"no-store", credentials:"omit"});
        if (!response.ok) throw Error("Manifest HTTP " + response.status);
        const { version } = await response.json();
        if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version))
            throw Error("Invalid pinball release version");
        const runtime = document.createElement("script");
        runtime.src = new URL("game-" + version + ".js", manifestUrl).href;
        runtime.onerror = () => console.error("Could not load DJ MARCUS J’S PINBALL MACHINE " + version);
        document.head.appendChild(runtime);
    }

    start().catch(error => console.error("DJ MARCUS J’S PINBALL MACHINE update check", error));
})();
