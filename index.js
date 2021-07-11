const express = require('express');
const bodyParser = require('body-parser');
const API_TOKEN = process.env.API_TOKEN;
const axios = require('axios');
const { request } = require('https')
const ya = require('ya-disk');
const { parse } = require('url');
const app = express();
const port = 3000;

const catalogPath = '/handwriting/cut-data/';
const classificationPath = '/handwriting/classifide-data/';

function createIfNotExist(path, override){
    return ya.meta.get(API_TOKEN, path)
        .then(() => {
            if (override) {
                return ya.resources.remove(API_TOKEN, path, false).then(
                    () => ya.resources.create(API_TOKEN, path)
                );
            }
        })
        .catch(() => ya.resources.create(API_TOKEN, path))
}


app.use(express.static('public'));
app.use(bodyParser.json());

app.get('/api/catalogs',
    (req, res) => 
        ya.meta.get(API_TOKEN, catalogPath, {
            fields: '_embedded.items.name,_embedded.items.type,_embedded.total'
        })
        .then(({_embedded})=> _embedded.items.reduce((result, {type, name}) => {
            if (type === 'dir') {
                result.push(name);
            }
            return result;
        }, []))
        .then((items) => res.send(items))
)

app.post('/api/catalogs/:catalogId', ({body, params}, res) => {
    createIfNotExist(classificationPath).then(() =>
        ya.upload.link(API_TOKEN, `${classificationPath}${params.catalogId}.json`, true)
    ).then(({ href, method }) => {
        const uploadStream = request({ ...parse(href), method });
        uploadStream.write(JSON.stringify(body))
        uploadStream.end()
        return createIfNotExist(`${classificationPath}${params.catalogId}`, true)
    })
    .then(() => res.sendStatus(200))
    .then(() => 
        Object.keys(body).reduce((promise, key) => {
            const classDir =  `${classificationPath}${params.catalogId}/${String(body[key])}`;
            return promise
                .then(() => createIfNotExist(classDir))
                .then(() => ya.resources.copy(API_TOKEN, `${catalogPath}${params.catalogId}/${key}`, `${classDir}/${key}`, true))
        }, Promise.resolve())
    )
})

app.get('/api/catalogs/:catalogId/photos', (req, res) => 
    ya.meta.get(API_TOKEN, `${catalogPath}${req.params.catalogId}`, {
        fields: '_embedded.items.name,_embedded.items.media_type',
        limit: req.query.limit,
        offset: req.query.offset,
    })
    .then(({_embedded }) => _embedded.items.reduce((result, {media_type, name}) => {
            if (media_type === 'image') {
                result.push(name);
            }
            return result;
        }, []))
    .then((items) => res.send(items))
)

app.get('/api/catalogs/:id/total', (req, res) => 
    ya.meta.get(API_TOKEN, `${catalogPath}${req.params.id}`, {
        fields: '_embedded.total'
    })
    .then(({_embedded }) => _embedded)
    .then((response) => res.send(response))
)

app.get('/api/result/:catalogId', (req, res) => 
    ya.download.link(API_TOKEN, `${classificationPath}${req.params.catalogId}.json`)
        .then(({ href }) => axios.get(href))
        .then(({data}) => res.send(data))   
);

app.get('/photos/:catalogId/:photoId', (req, res) => 
    ya.download.link(API_TOKEN, `${catalogPath}${req.params.catalogId}/${req.params.photoId}`)
        .then(({ href }) => axios.get(href, { responseType: 'arraybuffer' }))
        .then(({data}) => {
            res.write(data);
            res.end();
        })
);

app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`))