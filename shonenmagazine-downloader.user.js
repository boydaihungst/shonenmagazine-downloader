// ==UserScript==
// @name         Download Shonen Magazine, ichicomi manga as ZIP
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Intercept fetch, collect images, and download them all as a zip with proper filenames from pocket.shonenmagazine.com and ichicomi.com
// @author       boydaihungst
// @match        https://pocket.shonenmagazine.com/title/*/episode/*
// @match        https://ichicomi.com/episode/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.9.1/jszip.min.js
// @updateURL    https://raw.githubusercontent.com/boydaihungst/shonenmagazine-downloader/refs/heads/master/shonenmagazine-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/boydaihungst/shonenmagazine-downloader/refs/heads/master/shonenmagazine-downloader.user.js
// @grant        unsafeWindow
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// ==/UserScript==

(function () {
    "use strict";
    function waitForElementAsync(selector, timeout = 15000, doc = document) {
        return new Promise((resolve, reject) => {
            const element = doc.querySelector(selector);
            if (element) return resolve(element);

            const observer = new MutationObserver(() => {
                const el = doc.querySelector(selector);
                if (el) {
                    resolve(el);
                    observer.disconnect();
                    clearTimeout(timer);
                }
            });

            observer.observe(doc.body, { childList: true, subtree: true });

            // 3. Handle timeout
            const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout: ${selector} not found`));
            }, timeout);
        });
    }
    function waitForElement(selector, callback, timeout = 15000) {
        const interval = 100;
        let checkExist = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(checkExist);
                callback(element);
                checkExist = null;
            }
            timeout -= interval;
            if (timeout <= 0) {
                clearInterval(checkExist);
                checkExist = null;
            }
        }, interval); // check every 100ms
        return checkExist;
    }
    function gmFetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: options.method || "GET",
                url,
                headers: options.headers || {},
                data: options.body || null,
                responseType: options.responseType || "text",
                onload: (res) => resolve(res),
                onerror: (err) => reject(err),
            });
        });
    }

    async function canvasToBlob(canvas, type = "image/jpeg", quality = 1.0) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error("Canvas toBlob() failed."));
                    }
                },
                type,
                quality,
            );
        });
    }

    async function blobToImage(blob) {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        return new Promise((resolve, reject) => {
            img.onload = () => {
                URL.revokeObjectURL(url); // Clean up
                resolve(img);
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    async function changeSliderValue(newValue, patching) {
        try {
            document.querySelector(".c-viewer__nav-btn--page").click();
        } catch(e){
        }
        const slider = await waitForElementAsync(".c-viewer__range")
        if (!slider) {
            console.log('slider not found');
            return;
        }
        slider.value=patching ? slider.value+newValue : newValue;
        slider.dispatchEvent(new Event('input'));
    }

    async function getImageByIndex(idx) {
        await changeSliderValue(idx, false);
        const canvasContainers = document.querySelectorAll(".c-viewer__comic-item-image")
        if (canvasContainers.length < idx) {
            console.log("canvasContainers.length < image index number");
            return;
        }
        const container = canvasContainers[idx];
        const canvas = await waitForElementAsync("canvas", 15000, container)

        if (!canvas) {
            console.log("Can't get canvas");
            return;
        }
        return await canvasToBlob(canvas, "image/jpeg", 1.0);
    }

    const DIVIDE_NUM = 4;
    const MULTIPLE = 8;

    async function rearrangeImage(imgBlob, imgWidth, imgHeight) {
        const img = await blobToImage(imgBlob);
        const pieceWidth =
              Math.floor(imgWidth / (DIVIDE_NUM * MULTIPLE)) * MULTIPLE;
        const pieceHeight =
              Math.floor(imgHeight / (DIVIDE_NUM * MULTIPLE)) * MULTIPLE;

        const MAX_ROW = Math.ceil(imgHeight / pieceHeight);
        const MAX_COL = Math.ceil(imgWidth / pieceWidth);

        if (pieceWidth <= 0 || pieceHeight <= 0) {
            console.error(
                "Calculated piece dimensions are invalid. Image might be too small.",
            );
            return;
        }

        // Create a temporary canvas
        const canvas = document.createElement("canvas");
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        const ctx = canvas.getContext("2d");

        // Draw original image onto a hidden canvas
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = imgWidth;
        tempCanvas.height = imgHeight;
        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.drawImage(img, 0, 0);

        // Slice and rearrange
        for (let row = 0; row < MAX_ROW; row++) {
            for (let col = 0; col < MAX_COL; col++) {
                const srcX = col * pieceWidth;
                const srcY = row * pieceHeight;
                const width = Math.min(pieceWidth, imgWidth - srcX);
                const height = Math.min(pieceHeight, imgHeight - srcY);

                let destRow, destCol;
                if ((col + 1) * pieceWidth <= imgWidth) {
                    destRow = col;
                    destCol = row;
                } else {
                    destRow = row;
                    destCol = col;
                }

                const destX = destCol * pieceWidth;
                const destY = destRow * pieceHeight;

                // Copy slice
                const piece = tempCtx.getImageData(srcX, srcY, width, height);
                ctx.putImageData(piece, destX, destY);
            }
        }

        // Save the canvas as an image
        return await canvasToBlob(canvas, "image/jpeg");
    }

    let elementListening;
    function refreshDownloadBtnIchicomi() {
        if (elementListening) {
            clearInterval(elementListening);
        }
        elementListening = waitForElement("#episode-json", (element) => {
            const targetString = "cdn-img.ichicomi.com/public/page";
            const matchedUrls = new Set();
            let chapter_title;

            // Check if the button already exists to prevent duplicates
            let downloadButton = document.getElementById("custom-download-button");
            if (downloadButton) {
                document.body.removeChild(downloadButton);
                downloadButton.remove();
            }

            downloadButton = document.createElement("button");
            downloadButton.id = "custom-download-button";
            downloadButton.textContent = "Download All Images as ZIP";
            downloadButton.style.position = "fixed";
            downloadButton.style.bottom = "20px";
            downloadButton.style.right = "20px";
            downloadButton.style.zIndex = "9999";
            downloadButton.style.padding = "10px 15px";
            downloadButton.style.backgroundColor = "#007bff";
            downloadButton.style.color = "white";
            downloadButton.style.border = "none";
            downloadButton.style.borderRadius = "5px";
            downloadButton.style.cursor = "pointer";
            downloadButton.style.display = "block";
            document.body.appendChild(downloadButton);

            downloadButton.addEventListener("click", async () => {
                downloadButton.disabled = true;
                if (matchedUrls.size === 0) {
                    alert("No images intercepted yet!");
                    downloadButton.textContent = "Download All Images as ZIP";
                    downloadButton.disabled = false;
                    return;
                }

                const zip = new JSZip();

                let i = 0;
                for (const img of matchedUrls) {
                    downloadButton.textContent = `Downloading (${i}/${matchedUrls.size})...`;
                    try {
                        const imgRawRes = await gmFetch(img.src, {
                            responseType: "blob",
                        });
                        const blob = await imgRawRes.response;
                        const imgBlob = await rearrangeImage(blob, +img.width, +img.height);

                        // Extract filename from URL
                        const filename = `${i}.jpg`;

                        zip.folder(`${chapter_title || "image"}`).file(filename, imgBlob);
                    } catch (e) {
                        console.error("Failed to fetch image:", img, e);
                    }
                    i++;
                }
                downloadButton.textContent = `Zipping...`;
                zip
                    .generateAsync({
                    type: "blob",
                    compression: "STORE",
                    compressionOptions: { level: 0 },
                })
                    .then((content) => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(content);
                    a.download = `${chapter_title || "image"}.zip`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    downloadButton.disabled = false;
                    downloadButton.textContent = "Download All Images as ZIP";
                    URL.revokeObjectURL(a.href);
                });
            });
            const listEp_raw = JSON.parse(
                document.getElementById("episode-json").dataset.value,
            );
            if (
                listEp_raw.readableProduct &&
                listEp_raw.readableProduct.pageStructure &&
                Array.isArray(listEp_raw.readableProduct.pageStructure.pages)
            ) {
                const pages = listEp_raw.readableProduct.pageStructure.pages;
                const series_title = listEp_raw.readableProduct.series.title || "";
                chapter_title = `${series_title} - ${
          listEp_raw.readableProduct.title || ""
            }`.replace(/[<>:"/\\|?*]/g, "-");
                for (let i = 0; i < pages.length; i++) {
                    const img = pages[i];
                    if (img.type === "main" && img.src.includes(targetString)) {
                        matchedUrls.add(img);
                    }
                }
                downloadButton.style.display = "block";
            }
        });
    }
    const originalFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = async (...args) => {
        const [url, _] = args;

        const response = await originalFetch(...args);
        if (
            typeof url === "string" &&
            url.match(
                /.*api.pocket.shonenmagazine.com\/web\/episode\/viewer\?episode_id=.*/,
            )
        ) {
            const clonedResponse = response.clone();
            let scrambleSeed;

            try {
                const contentType = clonedResponse.headers.get("content-type");
                let data;
                if (contentType && contentType.includes("application/json")) {
                    data = await clonedResponse.json();
                } else {
                    console.warn("Response was not JSON for episode viewer API.");
                    return response;
                }

                if (data && data.page_list) {
                    scrambleSeed = data.scramble_seed;
                    const matchedUrls = data.page_list;

                    // Check if the button already exists to prevent duplicates
                    let downloadButton = document.getElementById(
                        "custom-download-button",
                    );
                    if (downloadButton) {
                        document.body.removeChild(downloadButton);
                        downloadButton.remove();
                    }

                    downloadButton = document.createElement("button");
                    downloadButton.id = "custom-download-button";
                    downloadButton.textContent = "Download All Images as ZIP";
                    downloadButton.style.position = "fixed";
                    downloadButton.style.bottom = "20px";
                    downloadButton.style.right = "20px";
                    downloadButton.style.zIndex = "9999";
                    downloadButton.style.padding = "10px 15px";
                    downloadButton.style.backgroundColor = "#007bff";
                    downloadButton.style.color = "white";
                    downloadButton.style.border = "none";
                    downloadButton.style.borderRadius = "5px";
                    downloadButton.style.cursor = "pointer";
                    downloadButton.style.display = "block";
                    document.body.appendChild(downloadButton);

                    downloadButton.addEventListener("click", async () => {
                        downloadButton.disabled = true;
                        if (matchedUrls.length === 0) {
                            alert("No image URLs found in the API response!");
                            downloadButton.textContent = "Download All Images as ZIP";
                            downloadButton.disabled = false;
                            return;
                        }

                        const zip = new JSZip();
                        const title = (
                            document.querySelector('h2[class*="EpisodeHeader-title"]')
                            ?.textContent ||
                            document.querySelector('h1[class*="episode-header-title"]')
                            ?.textContent ||
                            document.title ||
                            "manga"
                        ).replace(/[<>:"/\\|?*]/g, "-");

                        for (let i = 0; i < matchedUrls.length; i++) {
                            const imgUrl = matchedUrls[i];
                            downloadButton.textContent = `Downloading (${i + 1}/${
                matchedUrls.length
                        })...`;
                            try {
                                const imgRawRes = await gmFetch(imgUrl, {
                                    responseType: "blob",
                                });
                                const blob = await imgRawRes.response;
                                const imgBlob = await getImageByIndex(i);

                                // Pad page numbers with leading zeros for correct sorting
                                const pageNum = String(i + 1).padStart(3, "0");
                                const filename = `${pageNum}.jpg`;

                                zip.folder(title).file(filename, imgBlob);
                            } catch (e) {
                                console.error("Failed to fetch or process image:", imgUrl, e);
                            }
                        }
                        downloadButton.textContent = `Zipping...`;
                        zip
                            .generateAsync({
                            type: "blob",
                            compression: "STORE",
                            compressionOptions: { level: 0 },
                        })
                            .then((content) => {
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(content);
                            a.download = `${title}.zip`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);

                            downloadButton.disabled = false;
                            downloadButton.textContent = "Download All Images as ZIP";
                            URL.revokeObjectURL(a.href);
                        });
                    });
                }
            } catch (err) {
                console.error(`Error reading response from ${url}:`, err);
            }
        }
        if (typeof url === "string" && url.match(/.*ichicomi\.com\/episode.*/)) {
            refreshDownloadBtnIchicomi();
        }
        return response;
    };

    refreshDownloadBtnIchicomi();
})();
