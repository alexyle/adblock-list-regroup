const fs = require('fs');
const https = require('https');  
const compile = require("@adguard/hostlist-compiler");

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

Number of rule: ${ruleCount}

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


        const  ruleCount = countRules('adblock-list-regroup.txt');

        const now = new Date();
        const formattedDate = now.toISOString().split('T')[0];  
        const message = `Update adblock-list - ${formattedDate}`;
        fs.writeFileSync('commit-message.txt', message, 'utf8');


        const readmeContent = generateReadmeContent(updatedSources.sources, updatedSources.errors, ruleCount);
        fs.writeFileSync('README.md', readmeContent, 'utf8');


        
        process.exit(0);
        } catch (error) {
            console.error('An error occurred:', error);
        }
})();
