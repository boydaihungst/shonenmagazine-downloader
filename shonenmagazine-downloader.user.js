
// ==UserScript==
// @name         Download All Intercepted Images as ZIP (Shonen Magazine)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Intercept fetch, collect images, and download them all as a zip with proper filenames from pocket.shonenmagazine.com/episode/*
// @author       boydaihungst
// @match        https://pocket.shonenmagazine.com/episode/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @updateURL    https://gist.githubusercontent.com/boydaihungst/shonenmagazine-downloader/refs/heads/master/shonenmagazine-downloader.user.js
// @downloadURL  https://gist.githubusercontent.com/boydaihungst/shonenmagazine-downloader/refs/heads/master/shonenmagazine-downloader.user.js
// ==/UserScript==

(function () {
    'use strict';

    function waitForElement(id, callback) {
        const checkExist = setInterval(() => {
            const element = document.getElementById(id);
            if (element) {
                clearInterval(checkExist);
                callback(element);
            }
        }, 100); // check every 100ms
    }

    async function canvasToBlob(canvas, type = "image/jpeg", quality) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Canvas toBlob() failed."));
                }
            }, type, quality);
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
    const DIVIDE_NUM = 4;
    const MULTIPLE = 8;

    async function rearrangeImage(imgBlob, imgWidth, imgHeight) {

        const img = await blobToImage(imgBlob);
        const pieceWidth = Math.floor(imgWidth / (DIVIDE_NUM * MULTIPLE)) * MULTIPLE;
        const pieceHeight = Math.floor(imgHeight / DIVIDE_NUM);

        const MAX_ROW = 4;
        const MAX_COL = Math.ceil(imgWidth / pieceWidth);

        if (pieceWidth <= 0 || pieceHeight <= 0) {
            console.error("Calculated piece dimensions are invalid. Image might be too small.");
            return;
        }

        // Create a temporary canvas
        const canvas = document.createElement('canvas');
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        const ctx = canvas.getContext('2d');

        // Draw original image onto a hidden canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgWidth;
        tempCanvas.height = imgHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);

        // Slice and rearrange
        for (let row = 0; row < MAX_ROW; row++) {
            for (let col = 0; col < MAX_COL; col++) {
                const srcX = col * pieceWidth;
                const srcY = row * pieceHeight;
                const width = Math.min(pieceWidth, imgWidth - srcX);
                const height = Math.min(pieceHeight, imgHeight - srcY);

                let destRow, destCol;
                if ((col * pieceWidth) + pieceWidth < imgWidth) {
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
        return await canvasToBlob(canvas, 'image/jpeg');
    }

    waitForElement('episode-json', (element) => {

        const targetString = 'cdn-img.pocket.shonenmagazine.com/public/page';
        const matchedUrls = new Set();
        let chapter_title;

        const downloadButton = document.createElement('button');
        downloadButton.id = 'custom-download-button';
        downloadButton.textContent = 'Download All Images as ZIP';
        downloadButton.style.position = 'fixed';
        downloadButton.style.bottom = '20px';
        downloadButton.style.right = '20px';
        downloadButton.style.zIndex = '9999';
        downloadButton.style.padding = '10px 15px';
        downloadButton.style.backgroundColor = '#007bff';
        downloadButton.style.color = 'white';
        downloadButton.style.border = 'none';
        downloadButton.style.borderRadius = '5px';
        downloadButton.style.cursor = 'pointer';
        downloadButton.style.display = 'none';
        document.body.appendChild(downloadButton);

        downloadButton.addEventListener('click', async () => {

            downloadButton.disabled = true;
            if (matchedUrls.size === 0) {
                alert('No images intercepted yet!');
                downloadButton.textContent = 'Download All Images as ZIP';
                downloadButton.disabled = false;
                return;
            }

            const zip = new JSZip();

            let i = 0;
            for (const img of matchedUrls) {
                downloadButton.textContent = `Downloading (${i}/${matchedUrls.size})...`;
                try {
                    const response = await fetch(img.src);
                    const blob = await response.blob();
                    const imgBlob = await rearrangeImage(blob, +img.width, +img.height);

                    // Extract filename from URL
                    const filename = `${i}.jpg`;

                    zip.folder(`${chapter_title || "image"}`).file(filename, imgBlob);
                } catch (e) {
                    console.error('Failed to fetch image:', img, e);
                }
                i++;
            }
            zip.generateAsync({ type: 'blob' }).then(content => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(content);
                a.download = 'images.zip';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                downloadButton.disabled = false;
                downloadButton.textContent = 'Download All Images as ZIP';
                URL.revokeObjectURL(a.href);
            });
        });
        const listEp_raw = JSON.parse(document.getElementById('episode-json').dataset.value);
        if (listEp_raw.readableProduct && listEp_raw.readableProduct.pageStructure && Array.isArray(listEp_raw.readableProduct.pageStructure.pages)) {
            const pages = listEp_raw.readableProduct.pageStructure.pages;
            chapter_title = listEp_raw.readableProduct.title;
            for (let i = 0; i < pages.length; i++) {
                const img = pages[i];
                if (img.type == "main" && img.src.includes(targetString)) {
                    matchedUrls.add(img)
                }

            }
            downloadButton.style.display = 'block';
        }
    });

})();
