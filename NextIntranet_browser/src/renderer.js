const { ipcRenderer } = require("electron");

const fetchLabelData = async (labelInfo) => {
    try {
        const response = await fetch("http://127.0.0.1:8000/api/generate-label/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ label_info: labelInfo }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Chyba při získávání dat pro štítek:", error);
    }
};

document.getElementById("print-button").addEventListener("click", async () => {
    const labelInfo = { name: "Testovací jméno" }; // Data pro štítek
    const labelData = await fetchLabelData(labelInfo);

    if (labelData) {
        ipcRenderer.send("print-label", labelData);
    }
});
