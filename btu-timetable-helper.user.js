// ==UserScript==
// @name         BTU Classroom Table Exporter
// @namespace    https://timetable.usltd.ge/
// @version      1.3
// @description  Export course groups from BTU Classroom to JSON, HTML Table, CSV, and Markdown. Supports partial export and language selection.
// @author       Luka Mamukashvili <mamukashvili.luka@usltd.ge>
// @match        https://classroom.btu.edu.ge/en/student/me/course/groups/*
// @match        https://classroom.btu.edu.ge/ge/student/me/course/groups/*
// @match        https://classroom.btu.edu.ge/en/student/me/course/groups/*/*
// @match        https://classroom.btu.edu.ge/ge/student/me/course/groups/*/*
// @match        https://classroom.btu.edu.ge/en/student/me/course/index/*
// @match        https://classroom.btu.edu.ge/ge/student/me/course/index/*
// @match        https://classroom.btu.edu.ge/en/student/me/course/index/*/*
// @match        https://classroom.btu.edu.ge/ge/student/me/course/index/*/*
// @match        https://timetable.usltd.ge/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Auto-hide the userscript prompt if visited on the SPA
    if (location.hostname === 'timetable.usltd.ge') {
        // Expose a variable and fire an event to immediately notify the React app
        const s = document.createElement('script');
        s.textContent = 'window.__BTU_USERSCRIPT_ACTIVE = true; window.dispatchEvent(new CustomEvent("btu-userscript-detected"));';
        document.head.appendChild(s);
        s.remove();

        // Inject a quick CSS rule in case React already painted the hint element
        const style = document.createElement('style');
        style.textContent = '#userscript-hint { display: none !important; }';
        document.head.appendChild(style);
        return; // Halt execution so we don't try to find BTU tables here
    }

    // Wait for the main groups table to load in the DOM
    const initInterval = setInterval(() => {
        const table = document.getElementById('groups');
        if (table) {
            clearInterval(initInterval);
            initExporter(table);
        }
    }, 500);

    function initExporter(table) {
        // Prevent double injection
        if (table.hasAttribute('data-export-injected')) return;
        table.setAttribute('data-export-injected', 'true');

        // 1. Inject Checkboxes for partial export
        const groupTitles = table.querySelectorAll('.group_title');
        groupTitles.forEach(titleEl => {
            const row = titleEl.closest('tr');
            const firstCell = row.querySelector('td');

            if (firstCell) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'btu-export-cb';
                checkbox.checked = true; // Default to selected
                checkbox.title = 'Include this group in the export';
                checkbox.style.marginRight = '10px';
                checkbox.style.cursor = 'pointer';
                checkbox.style.width = '16px';
                checkbox.style.height = '16px';
                checkbox.style.verticalAlign = 'middle';

                firstCell.insertBefore(checkbox, firstCell.firstChild);
            }
        });

        // 2. Inject Export Buttons Panel
        const btnContainer = document.createElement('div');
        btnContainer.style.margin = '15px 0';
        btnContainer.style.padding = '12px';
        btnContainer.style.backgroundColor = '#f5f5f5';
        btnContainer.style.border = '1px solid #e3e3e3';
        btnContainer.style.borderRadius = '4px';
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '10px';
        btnContainer.style.alignItems = 'center';
        btnContainer.style.flexWrap = 'wrap';

        const label = document.createElement('strong');
        label.innerText = 'Export Selected: ';
        btnContainer.appendChild(label);

        // 3. Inject Language Selector
        const currentLang = location.href.includes('/en/') ? 'en' : (location.href.includes('/ge/') ? 'ge' : 'en');
        
        const langSelect = document.createElement('select');
        langSelect.id = 'btu-export-lang';
        langSelect.style.padding = '4px 8px';
        langSelect.style.borderRadius = '4px';
        langSelect.style.border = '1px solid #ccc';
        langSelect.innerHTML = `
            <option value="en" ${currentLang === 'en' ? 'selected' : ''}>English</option>
            <option value="ge" ${currentLang === 'ge' ? 'selected' : ''}>Georgian</option>
        `;
        btnContainer.appendChild(langSelect);

        const createBtn = (text, onClick) => {
            const btn = document.createElement('button');
            btn.innerText = text;
            btn.className = 'btn btn-default btn-sm'; // Using existing BTU bootstrap classes
            btn.style.marginLeft = '5px';
            btn.onclick = async (e) => {
                e.preventDefault();
                btn.disabled = true;
                const originalText = btn.innerText;
                btn.innerText = 'Loading...';
                try {
                    await onClick();
                } catch (err) {
                    console.error("Export failed:", err);
                    alert("Export failed. See console for details.");
                } finally {
                    btn.disabled = false;
                    btn.innerText = originalText;
                }
            };
            return btn;
        };

        btnContainer.appendChild(createBtn('Clean HTML', () => processExport(generateHTML, 'html', 'text/html')));
        btnContainer.appendChild(createBtn('JSON', () => processExport(generateJSON, 'json', 'application/json')));
        btnContainer.appendChild(createBtn('CSV', () => processExport(generateCSV, 'csv', 'text/csv;charset=utf-8;')));
        btnContainer.appendChild(createBtn('Markdown', () => processExport(generateMarkdown, 'md', 'text/markdown')));

        table.parentNode.insertBefore(btnContainer, table);
    }

    // --- Core Export Orchestrator ---
    async function processExport(generatorFunc, extension, mimeType) {
        const doc = await getTargetDocument();
        if (!doc) return; // Halt if redirect was required

        const checkedIds = getCheckedIds();
        const data = extractData(doc, checkedIds);

        if (data.length === 0) {
            alert("No groups selected to export.");
            return;
        }

        // Generate filename based on course title, falling back to 'schedule'
        const courseNameRaw = data[0].courseTitle || 'schedule';
        const courseName = courseNameRaw.replace(/[\/\\?%*:|"<>]/g, '-').trim() || 'schedule';
        const filename = `${courseName}.${extension}`;

        const content = generatorFunc(data);
        download(content, filename, mimeType);
    }

    // --- Document & State Fetching ---
    async function getTargetDocument() {
        const targetLang = document.getElementById('btu-export-lang').value;
        const currentLang = location.href.includes('/en/') ? 'en' : (location.href.includes('/ge/') ? 'ge' : null);

        // If the requested language is the currently active one, just use the current document
        if (targetLang === currentLang || !currentLang) {
            return document;
        }

        const targetUrl = location.href.replace(`/${currentLang}/`, `/${targetLang}/`);
        try {
            const response = await fetch(targetUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Ensure the main table exists in the fetched HTML (if site loads dynamically)
            if (!doc.getElementById('groups')) {
                console.warn("Table not found in background HTML. Page likely rendered dynamically.");
                const confirmNav = confirm("The selected language needs to be loaded directly. Redirect now?");
                if (confirmNav) {
                    window.location.href = targetUrl;
                }
                return null;
            }
            return doc;
        } catch (e) {
            console.error("Fetch failed", e);
            alert("Failed to fetch the alternative language. Will use the current page instead.");
            return document; // Fallback to current
        }
    }

    function getCheckedIds() {
        const checked = [];
        document.querySelectorAll('.btu-export-cb:checked').forEach(cb => {
            const titleEl = cb.closest('tr').querySelector('.group_title');
            if (titleEl) {
                checked.push(titleEl.getAttribute('data-id'));
            }
        });
        return checked;
    }

    // --- Data Extraction Logic ---
    function extractData(doc, checkedIds) {
        const data = [];
        const groupTitles = doc.querySelectorAll('.group_title');
        const legendEl = doc.querySelector('legend');
        const courseTitle = legendEl ? legendEl.textContent.trim() : 'Unknown Course';

        groupTitles.forEach(titleEl => {
            const dataId = titleEl.getAttribute('data-id');

            // Skip if user unchecked the partial export checkbox
            if (!checkedIds.includes(dataId)) return;

            const mainRow = titleEl.closest('tr');
            const groupName = titleEl.textContent.trim();

            // Extract Instructor (Text node after the user icon)
            let instructor = "";
            const userIcon = mainRow.querySelector('.glyphicon-user');
            if (userIcon && userIcon.nextSibling) {
                instructor = userIcon.nextSibling.textContent.trim();
            }

            // Extract Schedule from the nested hidden row
            const schedules = [];
            const schedRow = doc.getElementById('tr-' + dataId);
            if (schedRow) {
                const schedRows = schedRow.querySelectorAll('table tbody tr');
                schedRows.forEach(sr => {
                    const tds = sr.querySelectorAll('td');
                    if (tds.length >= 3) {
                        schedules.push({
                            day: tds[0].textContent.trim(),
                            time: tds[1].textContent.trim(),
                            room: tds[2].textContent.trim()
                        });
                    }
                });
            }

            data.push({ courseTitle, groupName, instructor, schedules });
        });

        return data;
    }

    // --- Format Generators ---

    function generateJSON(data) {
        return JSON.stringify(data, null, 2);
    }

    function generateHTML(data) {
        let html = '<table border="1" style="border-collapse: collapse;">\n';
        if (data.length > 0) {
            html += `  <caption><strong>${data[0].courseTitle}</strong></caption>\n`;
        }
        html += '  <thead>\n    <tr>\n      <th>Group</th>\n      <th>Instructor</th>\n      <th>Day</th>\n      <th>Time</th>\n      <th>Room</th>\n    </tr>\n  </thead>\n  <tbody>\n';

        data.forEach(group => {
            if (group.schedules.length === 0) {
                html += `    <tr><td>${group.groupName}</td><td>${group.instructor}</td><td></td><td></td><td></td></tr>\n`;
            } else {
                group.schedules.forEach((sched, index) => {
                    html += '    <tr>\n';
                    // Use rowspan for the first line of the group to avoid repeating names
                    if (index === 0) {
                        html += `      <td rowspan="${group.schedules.length}">${group.groupName}</td>\n`;
                        html += `      <td rowspan="${group.schedules.length}">${group.instructor}</td>\n`;
                    }
                    html += `      <td>${sched.day}</td>\n      <td>${sched.time}</td>\n      <td>${sched.room}</td>\n    </tr>\n`;
                });
            }
        });

        html += '  </tbody>\n</table>';
        return html; // Pure table component, no html/body/doctype
    }

    function generateCSV(data) {
        let csv = '\uFEFF'; // UTF-8 BOM so Excel reads Georgian characters correctly
        csv += '"Course","Group","Instructor","Day","Time","Room"\n';

        data.forEach(group => {
            if (group.schedules.length === 0) {
                csv += `"${group.courseTitle}","${group.groupName}","${group.instructor}","","",""\n`;
            } else {
                group.schedules.forEach(sched => {
                    csv += `"${group.courseTitle}","${group.groupName}","${group.instructor}","${sched.day}","${sched.time}","${sched.room}"\n`;
                });
            }
        });
        return csv;
    }

    function generateMarkdown(data) {
        let md = '';
        if (data.length > 0) {
            md += `**Course:** ${data[0].courseTitle}\n\n`;
        }
        md += '| Group | Instructor | Day | Time | Room |\n';
        md += '| --- | --- | --- | --- | --- |\n';

        data.forEach(group => {
            if (group.schedules.length === 0) {
                md += `| ${group.groupName} | ${group.instructor} | | | |\n`;
            } else {
                group.schedules.forEach((sched, index) => {
                    // Only show Group Name and Instructor on the first row of that group for readability
                    const gName = index === 0 ? group.groupName : "";
                    const instr = index === 0 ? group.instructor : "";
                    md += `| ${gName} | ${instr} | ${sched.day} | ${sched.time} | ${sched.room} |\n`;
                });
            }
        });
        return md;
    }

    // --- File Downloader ---
    function download(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
})();
