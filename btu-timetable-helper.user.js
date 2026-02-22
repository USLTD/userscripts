// ==UserScript==
// @name         BTU Classroom Table Exporter
// @namespace    https://usltd.ge/
// @version      1.1
// @description  Export course groups from BTU Classroom to JSON, HTML Table, CSV, and Markdown. Supports partial export.
// @author       Luka Mamukashvili <mamukashvili.luka@usltd.ge>
// @match        https://classroom.btu.edu.ge/en/student/me/course/groups/*
// @match        https://classroom.btu.edu.ge/ge/student/me/course/groups/*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

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

        const label = document.createElement('strong');
        label.innerText = 'Export Selected: ';
        btnContainer.appendChild(label);

        const createBtn = (text, onClick) => {
            const btn = document.createElement('button');
            btn.innerText = text;
            btn.className = 'btn btn-default btn-sm'; // Using existing BTU bootstrap classes
            btn.style.marginLeft = '5px';
            btn.onclick = (e) => {
                e.preventDefault();
                onClick();
            };
            return btn;
        };

        btnContainer.appendChild(createBtn('Clean HTML', () => download(generateHTML(), 'schedule.html', 'text/html')));
        btnContainer.appendChild(createBtn('JSON', () => download(generateJSON(), 'schedule.json', 'application/json')));
        btnContainer.appendChild(createBtn('CSV', () => download(generateCSV(), 'schedule.csv', 'text/csv;charset=utf-8;')));
        btnContainer.appendChild(createBtn('Markdown', () => download(generateMarkdown(), 'schedule.md', 'text/markdown')));

        table.parentNode.insertBefore(btnContainer, table);
    }

    // --- Data Extraction Logic ---
    function extractData() {
        const data = [];
        const groupTitles = document.querySelectorAll('.group_title');
        const courseTitle = document.querySelector('legend') ? document.querySelector('legend').textContent.trim() : 'Unknown Course';

        groupTitles.forEach(titleEl => {
            const mainRow = titleEl.closest('tr');
            const checkbox = mainRow.querySelector('.btu-export-cb');

            // Skip if user unchecked the partial export checkbox
            if (checkbox && !checkbox.checked) return;

            const groupName = titleEl.textContent.trim();
            const dataId = titleEl.getAttribute('data-id');

            // Extract Instructor (Text node after the user icon)
            let instructor = "";
            const userIcon = mainRow.querySelector('.glyphicon-user');
            if (userIcon && userIcon.nextSibling) {
                instructor = userIcon.nextSibling.textContent.trim();
            }

            // Extract Schedule from the nested hidden row
            const schedules = [];
            const schedRow = document.getElementById('tr-' + dataId);
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

    function generateJSON() {
        return JSON.stringify(extractData(), null, 2);
    }

    function generateHTML() {
        const data = extractData();
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

    function generateCSV() {
        const data = extractData();
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

    function generateMarkdown() {
        const data = extractData();
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
