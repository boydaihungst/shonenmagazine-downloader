// ==UserScript==
// @name         Download Shonen Magazine, ichicomi manga as ZIP
// @namespace    http://tampermonkey.net/
// @version      3.1
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
    'use strict';

    function waitForElement(id, callback, timeout = 15000) {
        const interval = 100;
        let checkExist = setInterval(() => {
            const element = document.getElementById(id);
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
                method: options.method || 'GET',
                url,
                headers: options.headers || {},
                data: options.body || null,
                responseType: options.responseType || 'text',
                onload: res => resolve(res),
                onerror: err => reject(err),
            });
        });
    }

    async function canvasToBlob(canvas, type = 'image/jpeg', quality = 1.0) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                blob => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Canvas toBlob() failed.'));
                    }
                },
                type,
                quality
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
    function* xorshift32(seed) {
        const s = new Uint32Array([seed >>> 0]);
        while (true) {
            s[0] ^= s[0] << 13;
            s[0] ^= s[0] >>> 17;
            s[0] ^= s[0] << 5;
            yield s[0] >>> 0;
        }
    }

    function shuffleOrder(count, seed) {
        const gen = xorshift32(seed);
        return [...Array(count).keys()]
            .map(i => [gen.next().value, i])
            .sort((a, b) => a[0] - b[0])
            .map(x => x[1]);
    }

    /**
   * Replicates the website's logic for calculating the dimensions of the unscrambled image.
   * This function ensures the final dimensions are perfectly divisible by the tiles,
   * effectively cropping out any "leftover" pixels from the original image.
   *
   * @param {number} originalWidth - The width of the scrambled source image.
   * @param {number} originalHeight - The height of the scrambled source image.
   * @param {number} tileCount - The number of tiles per side (e.g., 4 for a 4x4 grid).
   * @returns {{width: number, height: number} | null} The calculated dimensions or null if image is too small.
   */
    const calculateDescrambleDimensions = (
        originalWidth,
        originalHeight,
        tileCount = 4
    ) => {
        const y = 8; // This is the constant 'y' from the website's source code.
        if (originalWidth < tileCount * y || originalHeight < tileCount * y) {
            return null; // Image is too small to descramble.
        }
        const tempWidth = Math.floor(originalWidth / y);
        const tempHeight = Math.floor(originalHeight / y);

        const finalTileableWidth = Math.floor(tempWidth / tileCount);
        const finalTileableHeight = Math.floor(tempHeight / tileCount);

        return {
            width: finalTileableWidth * y,
            height: finalTileableHeight * y,
        };
    };

    /**
   * De-scrambles a shonenmagazine image blob.
   *
   * @param {Blob} imgBlob - The scrambled image data.
   * @param {number} scrambleSeed - The seed used for scrambling.
   * @param {number} tileCount - The number of tiles per side (default is 4).
   * @returns {Promise<Blob>} A new blob with the de-scrambled image data.
   */
    async function unscrambleImage(imgBlob, scrambleSeed, tileCount = 4) {
        const img = await blobToImage(imgBlob);

        // 1. Calculate the correct dimensions for the canvas using the website's exact logic.
        const descrambleDims = calculateDescrambleDimensions(
            img.width,
            img.height,
            tileCount
        );

        // If the image is too small or dimensions can't be calculated, return the original.
        if (!descrambleDims) {
            console.warn('Image too small to descramble, returning original.');
            return imgBlob;
        }

        const ctx = Object.assign(document.createElement('canvas'), {
            width: img.width,
            height: img.height,
        }).getContext('2d');

        const { width: tileW, height: tileH } = descrambleDims;
        let leftoverW = img.width - tileW * tileCount;
        let leftoverH = img.height - tileH * tileCount;

        if (leftoverW) {
            console.log('leftoverW', leftoverW);
            console.log('leftoverH', leftoverH);
            // oneMoreTile = width - tileW * tileCount;
        }
        // 3. Get the shuffled order of tiles.
        const order = shuffleOrder(tileCount ** 2, scrambleSeed);

        // 4. Reassemble the image by drawing the shuffled tiles in the correct order.
        for (let i = 0; i < order.length; i++) {
            const sourceTileIndex = order[i];
            const destTileIndex = i;

            // Calculate the source (scrambled) tile's top-left corner.
            const srcX = (sourceTileIndex % tileCount) * tileW;
            const srcY = Math.floor(sourceTileIndex / tileCount) * tileH;

            // Calculate the destination (unscrambled) tile's top-left corner.
            const destX = (destTileIndex % tileCount) * tileW;
            const destY = Math.floor(destTileIndex / tileCount) * tileH;

            ctx.drawImage(img, srcX, srcY, tileW, tileH, destX, destY, tileW, tileH);
        }

        // copy rightmost leftover vertical strip (if any)
        if (leftoverW > 0) {
            ctx.drawImage(
                img,
                img.width - leftoverW,
                0, // source
                leftoverW,
                img.height,
                img.width - leftoverW,
                0, // dest
                leftoverW,
                img.height
            );
        }

        // copy bottom leftover horizontal strip (if any)
        if (leftoverH > 0) {
            ctx.drawImage(
                img,
                0,
                img.height - leftoverH, // source
                img.width,
                leftoverH,
                0,
                img.height - leftoverH, // dest
                img.width,
                leftoverH
            );
        }

        return await canvasToBlob(ctx.canvas, 'image/jpeg', 1.0);
    }

    const DIVIDE_NUM = 4;
    const MULTIPLE = 8;

    async function rearrangeImage(imgBlob, imgWidth, imgHeight) {

        const img = await blobToImage(imgBlob);
        const pieceWidth = Math.floor(imgWidth / (DIVIDE_NUM * MULTIPLE)) * MULTIPLE;
        const pieceHeight = Math.floor(imgHeight / (DIVIDE_NUM * MULTIPLE)) * MULTIPLE;

        const MAX_ROW = Math.ceil(imgHeight / pieceHeight);
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
                if (((col + 1) * pieceWidth) <= imgWidth) {
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

    let elementListening;
    function refreshDownloadBtnIchicomi(){

        if (elementListening) {
            clearInterval(elementListening);
        }
        elementListening = waitForElement('episode-json', element => {
            const targetString = 'cdn-img.ichicomi.com/public/page';
            const matchedUrls = new Set();
            let chapter_title;

            // Check if the button already exists to prevent duplicates
            let downloadButton = document.getElementById('custom-download-button');
            if (downloadButton) {
                document.body.removeChild(downloadButton);
                downloadButton.remove();
            }

            downloadButton = document.createElement('button');
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
            downloadButton.style.display = 'block';
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
                        const imgRawRes = await gmFetch(img.src, {
                            responseType: 'blob',
                        });
                        const blob = await imgRawRes.response;
                        const imgBlob = await rearrangeImage(blob, +img.width, +img.height);

                        // Extract filename from URL
                        const filename = `${i}.jpg`;

                        zip.folder(`${chapter_title || 'image'}`).file(filename, imgBlob);
                    } catch (e) {
                        console.error('Failed to fetch image:', img, e);
                    }
                    i++;
                }
                downloadButton.textContent = `Zipping...`;
                zip.generateAsync({ type: 'blob', compression: "STORE",compressionOptions: { level: 0 } }).then(content => {
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(content);
                    a.download = `${chapter_title || 'image'}.zip`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    downloadButton.disabled = false;
                    downloadButton.textContent = 'Download All Images as ZIP';
                    URL.revokeObjectURL(a.href);
                });
            });
            const listEp_raw = JSON.parse(
                document.getElementById('episode-json').dataset.value
            );
            if (
                listEp_raw.readableProduct &&
                listEp_raw.readableProduct.pageStructure &&
                Array.isArray(listEp_raw.readableProduct.pageStructure.pages)
            ) {
                const pages = listEp_raw.readableProduct.pageStructure.pages;
                const series_title = listEp_raw.readableProduct.series.title || '';
                chapter_title = `${series_title} - ${
        listEp_raw.readableProduct.title || ''
            }`.replace(/[<>:"/\\|?*]/g, '-');
                for (let i = 0; i < pages.length; i++) {
                    const img = pages[i];
                    if (img.type === 'main' && img.src.includes(targetString)) {
                        matchedUrls.add(img);
                    }
                }
                downloadButton.style.display = 'block';
            }
        });
    }
    const originalFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = async (...args) => {
        const [url, _] = args;

        const response = await originalFetch(...args);
        if (
            typeof url === 'string' &&
            url.match(
                /.*api.pocket.shonenmagazine.com\/web\/episode\/viewer\?platform=.*&episode_id=.*/
            )
        ) {
            const clonedResponse = response.clone();
            let scrambleSeed;

            try {
                const contentType = clonedResponse.headers.get('content-type');
                let data;
                if (contentType && contentType.includes('application/json')) {
                    data = await clonedResponse.json();
                } else {
                    console.warn('Response was not JSON for episode viewer API.');
                    return response;
                }

                if (data && data.page_list) {
                    scrambleSeed = data.scramble_seed;
                    const matchedUrls = data.page_list;

                    // Check if the button already exists to prevent duplicates
                    let downloadButton = document.getElementById(
                        'custom-download-button'
                    );
                    if (downloadButton) {
                        document.body.removeChild(downloadButton);
                        downloadButton.remove();
                    }

                    downloadButton = document.createElement('button');
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
                    downloadButton.style.display = 'block';
                    document.body.appendChild(downloadButton);

                    downloadButton.addEventListener('click', async () => {
                        downloadButton.disabled = true;
                        if (matchedUrls.length === 0) {
                            alert('No image URLs found in the API response!');
                            downloadButton.textContent = 'Download All Images as ZIP';
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
                            'manga'
                        ).replace(/[<>:"/\\|?*]/g, '-');

                        for (let i = 0; i < matchedUrls.length; i++) {
                            const imgUrl = matchedUrls[i];
                            downloadButton.textContent = `Downloading (${i + 1}/${
                matchedUrls.length
                        })...`;
                            try {
                                const imgRawRes = await gmFetch(imgUrl, {
                                    responseType: 'blob',
                                });
                                const blob = await imgRawRes.response;

                                // Make sure to convert scrambleSeed to a number if it's a string
                                const imgBlob = await unscrambleImage(blob, +scrambleSeed);

                                // Pad page numbers with leading zeros for correct sorting
                                const pageNum = String(i + 1).padStart(3, '0');
                                const filename = `${pageNum}.jpg`;

                                zip.folder(title).file(filename, imgBlob);

                            } catch (e) {
                                console.error('Failed to fetch or process image:', imgUrl, e);
                            }
                        }
                        downloadButton.textContent = `Zipping...`;
                        zip.generateAsync({ type: 'blob', compression: "STORE",compressionOptions: { level: 0 } }).then(content => {
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(content);
                            a.download = `${title}.zip`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);

                            downloadButton.disabled = false;
                            downloadButton.textContent = 'Download All Images as ZIP';
                            URL.revokeObjectURL(a.href);
                        });
                    });
                }
            } catch (err) {
                console.error(`Error reading response from ${url}:`, err);
            }
        }
        if (
            typeof url === 'string' &&
            url.match(
                /.*ichicomi\.com\/episode.*/
            )
        ) {
            refreshDownloadBtnIchicomi()
        }
        return response;
    };

    refreshDownloadBtnIchicomi()
})();
