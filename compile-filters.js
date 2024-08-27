const fs = require('fs');
const https = require('https');  
const compile = require("@adguard/hostlist-compiler");
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const path = require('path');

const testUrl = (url) => {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            resolve(res.statusCode === 200);  
        }).on('error', () => {
            resolve(false);  
        });
    });
};

const countRules = (filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.split('\n').filter(line => line.trim().length > 0 && !line.trim().startsWith('!'));
        return lines.length;
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return 0;
    }
};

const updateHistory = (ruleCount) => {
    const historyFilePath = 'rule-history.json';
    let history = [];

    if (fs.existsSync(historyFilePath)) {
        const historyData = fs.readFileSync(historyFilePath, 'utf8');
        history = JSON.parse(historyData);
    }

    if (!Array.isArray(history)) {
        history = [];
    }

    const currentDate = new Date().toISOString().split('T')[0];

    const existingEntryIndex = history.findIndex(entry => entry.date === currentDate);

    if (existingEntryIndex !== -1) {
        history[existingEntryIndex].rules = ruleCount;
    } else {
        history.push({
            date: currentDate,
            rules: ruleCount
        });
    }

    fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2), 'utf8');
    return history;
};

const generateGraph = async (history) => {
    const width = 800;
    const height = 400;
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

    if (!Array.isArray(history) || history.length === 0) {
        console.error('No history data available to generate the graph.');
        return;
    }

    const labels = history.map(entry => entry.date);
    const data = history.map(entry => entry.rules);

    const configuration = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                fill: false,
                borderColor: 'rgb(31, 119, 181)',
                borderWidth: 2,
                tension: 0,
                pointRadius: 0  
            }]
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: 'Number of Rules Over Time',  
                    color: 'black',
                    font: {
                        size: 18
                    }
                },
                legend: {
                    display: false  
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Date',
                        color: 'black', 
                    },
                    ticks: {
                        color: 'black', 
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Number of Rules',
                        color: 'black', 
                    },
                    ticks: {
                        color: 'black', 
                    },
                    beginAtZero: false,  
                    min: Math.min(...data) - 1000,  
                    max: Math.max(...data) + 1000, 
                }
            },
            layout: {
                padding: 20
            },
            backgroundColor: 'white'  
        }
    };

    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
    const imagePath = path.join(__dirname, 'rules-graph.png');
    fs.writeFileSync(imagePath, imageBuffer);
    console.log('Graph generated and saved successfully.');
};

const generateReadmeContent = (sources, errors, ruleCount) => {
    const sourceHeader = '| Name | Source |\n|------|--------|\n';
    const sourceRows = sources.map(source => `| ${source.name} | ${source.source} |\n`).join('');
    
    const errorHeader = '| Name | Source | Error |\n|------|--------|-------|\n';
    const errorRows = errors.map(error => `| ${error.name} | ${error.source} | ${error.error} |\n`).join('');

    return `
# ad-block-list-regroup

This repository contains a collection of adblock filter lists for adguard home. Each entry in the list corresponds to a source used to generate the adblock list.

## How install

Add link in filter

https://raw.githubusercontent.com/alexyle/adblock-list-regroup/main/adblock-list-regroup.txt


## Info

Last update: ${new Date().toISOString().split('T')[0]}

Filter: ${sources.length}

Rule: ${ruleCount}

![Number of Rules Over Time](rules-graph.png)

## Sources

${sourceHeader}${sourceRows}

${errors.length > 0 ? `##Error list


${errorHeader}${errorRows}` : ''}
    
## Contributing

If you would like to add a new list to this collection, please create an issue on this repository with the details.

`;
};

(async () => {
    try {

        const jsonData = fs.readFileSync('list.json', 'utf8');
        const sources = JSON.parse(jsonData);
        const validSources = [];
        const errors = [];

        for (const source of sources.data) {
            const isValid = await testUrl(source.source);
            if (isValid) {
                validSources.push(source);
            } else {
                errors.push({
                    ...source,
                    error: 'URL is not accessible'
                });
            }
        }

        const updatedSources = {
            sources: validSources,
            errors: errors
        };

        
        const result = await compile({
            name: 'adblock-list-regroup',
            sources: validSources,
            transformations: ['Deduplicate', 'RemoveEmptyLines', 'TrimLines', 'Compress', 'Validate'],
        });


        fs.writeFileSync('adblock-list-regroup.txt', result.join('\n'), 'utf8');
        console.log('Hostlist compiled and saved successfully.');


        const ruleCount = countRules('adblock-list-regroup.txt');

        const history = updateHistory(ruleCount);

        await generateGraph(history);


        const readmeContent = generateReadmeContent(updatedSources.sources, updatedSources.errors, ruleCount);
        fs.writeFileSync('README.md', readmeContent, 'utf8');


        
        process.exit(0);
        } catch (error) {
            console.error('An error occurred:', error);
        }
})();
