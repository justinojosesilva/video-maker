const algorithmia = require('algorithmia')
const algorithmiaApiKey = require('../credentials/algorithmia.json').apiKey
const sentenceBoundaryDetection = require('sbd')

const watsonApiKey = require('../credentials/watson-nlu.json').apikey
const NaturalLanguageUnderstandingV1 = require('watson-developer-cloud/natural-language-understanding/v1.js')

const nlu = new NaturalLanguageUnderstandingV1 ({
    iam_apikey: watsonApiKey,
    version: '2019-07-12',
    url: 'https://api.au-syd.natural-language-understanding.watson.cloud.ibm.com/instances/8df2b271-2804-45ad-8df4-bf54c05ffefb'
})

const state = require('./state.js')



async function robot() {
    const content = state.load()
    
    await fetchContentFromWikipedia(content)
    sanitizeContent(content)
    breakContentIntoSentences(content)
    limitMaximumSentences(content)
    await fetchKeywordsOfAllSentences(content)
    
    state.save(content)

    async function fetchContentFromWikipedia(content) {
        const algorithmiaAuthenticated = algorithmia(algorithmiaApiKey)
        const wikipediaAlgorith = algorithmiaAuthenticated.algo('web/WikipediaParser/0.1.2?timeout=300')
        const wikipediaResponse = await wikipediaAlgorith.pipe(content.searchTerm)
        const wikipediaContent = wikipediaResponse.get()
        
        content.sourceContentOriginal = wikipediaContent.content
    }
    
    function sanitizeContent(content) {
        const withoutBlankLinesAndMarkdown = removeBlankLinesAndMarkdown(content.sourceContentOriginal)
        const withoutDatesInParentheses = removeDatesInParentheses(withoutBlankLinesAndMarkdown)
        
        content.sourceContentSanitized = withoutDatesInParentheses
        
        function removeBlankLinesAndMarkdown(text) {
            const allLines = text.split('\n')
            
            const withoutBlankLinesAndMarkdown = allLines.filter((line) => {
                if(line.trim().length === 0 || line.trim().startsWith('=')) {
                    return false
                }
                return true
            })
            
            return withoutBlankLinesAndMarkdown.join(' ')
        }
    }
    
    function removeDatesInParentheses(text) {
        return text.replace(/\((?:\([^()]*\)|[^()])*\)/gm, '').replace(/  /g, '')
    }
    
    function breakContentIntoSentences(content) {
        content.sentences = []
        
        const sentences = sentenceBoundaryDetection.sentences(content.sourceContentSanitized)
        sentences.forEach((sentence) => {
            content.sentences.push({
                text: sentence,
                keywords: [],
                images: []
            })
        })
    }
    
    function limitMaximumSentences(content) {
        content.sentences = content.sentences.slice(0, content.maximumSentences)
    }
    
    async function fetchKeywordsOfAllSentences(content) {
        for (const sentence of content.sentences) {
            sentence.keywords = await fetchWatsonAndReturnKeywords(sentence.text)
        }
    }
    
    async function fetchWatsonAndReturnKeywords(sentence) {
        return new Promise((resolve, reject) => {
            nlu.analyze({
                text: sentence,
                features: {
                    keywords: {}
                }
            }, (error, response) => {
                if (error) {
                    throw error
                }
                const keywords = response.keywords.map((keyword) => {
                    return keyword.text
                })
                resolve(keywords)
            })
        })
    }    
}

module.exports = robot