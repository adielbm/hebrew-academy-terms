the original site (https://terms.hebrew-academy.org.il/) is currently [down](https://www.ynet.co.il/news/article/sjb04v0f11e) (as of April 2026)

# setup

1. first have the the source HTML files from Web Archive to `source-html` directory
    - https://web.archive.org/web/20250627114638/https://terms.hebrew-academy.org.il/Millonim.aspx 
2. run `html-to-json-converter.mjs` to convert the source HTML files to a JSON file (`public/data.json`). (it might need some modification to work)
3. `npm i`
4. `npm run dev` or `npm run build`


