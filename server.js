const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const app = express();

// ==========================================
// SERVER PORT
// ==========================================

const START_PORT = Number(process.env.PORT) || 3001;


// ==========================================
// FOLDERS
// ==========================================

const uploadDir = path.join(__dirname, "uploads");
const dataDir = path.join(__dirname, "data");

const database = path.join(dataDir, "papers.json");


// ==========================================
// CREATE REQUIRED FOLDERS
// ==========================================

fs.mkdirSync(uploadDir, {
    recursive: true
});

fs.mkdirSync(dataDir, {
    recursive: true
});


// ==========================================
// CREATE DATABASE FILE
// ==========================================

if (!fs.existsSync(database)) {

    fs.writeFileSync(
        database,
        "[]",
        "utf8"
    );
}


// ==========================================
// EXPRESS SETTINGS
// ==========================================

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


// ==========================================
// WEBSITE FILES
// ==========================================

const publicDir = path.join(
    __dirname,
    "public"
);

const publicIndex = path.join(
    publicDir,
    "index.html"
);

const rootIndex = path.join(
    __dirname,
    "index.html"
);


// ==========================================
// SERVE WEBSITE
// ==========================================

if (fs.existsSync(publicDir)) {

    app.use(
        express.static(publicDir)
    );

} else {

    app.use(
        express.static(__dirname, {
            index: "index.html"
        })
    );
}


// ==========================================
// SERVE UPLOADED FILES
// ==========================================

app.use(
    "/uploads",
    express.static(uploadDir)
);


// ==========================================
// MULTER STORAGE
// ==========================================

const storage = multer.diskStorage({

    destination: function (req, file, cb) {

        cb(
            null,
            uploadDir
        );

    },

    filename: function (req, file, cb) {

        const safeName =
            file.originalname
                .replace(
                    /[^a-zA-Z0-9._-]/g,
                    "_"
                );

        const finalName =
            Date.now() +
            "-" +
            safeName;

        cb(
            null,
            finalName
        );

    }

});


const upload = multer({

    storage: storage,

    limits: {

        fileSize:
            25 * 1024 * 1024

    },

    fileFilter: function (
        req,
        file,
        cb
    ) {

        const allowedExtensions = [

            ".pdf",
            ".docx",
            ".txt",
            ".md"

        ];

        const extension =
            path.extname(
                file.originalname
            ).toLowerCase();

        if (
            allowedExtensions.includes(
                extension
            )
        ) {

            cb(
                null,
                true
            );

        } else {

            cb(
                new Error(
                    "Only PDF, DOCX, TXT and MD files are allowed."
                )
            );

        }

    }

});


// ==========================================
// DATABASE FUNCTIONS
// ==========================================

function readDatabase() {

    try {

        const data =
            fs.readFileSync(
                database,
                "utf8"
            );

        const parsed =
            JSON.parse(data);

        if (!Array.isArray(parsed)) {

            return [];

        }

        return parsed;

    } catch (error) {

        console.error(
            "Database read error:",
            error.message
        );

        return [];

    }

}


function saveDatabase(data) {

    try {

        fs.writeFileSync(

            database,

            JSON.stringify(
                data,
                null,
                2
            ),

            "utf8"

        );

    } catch (error) {

        console.error(
            "Database save error:",
            error.message
        );

        throw error;

    }

}


// ==========================================
// CLEAN TEXT
// ==========================================

function cleanText(text) {

    return String(text || "")

        .replace(
            /\r/g,
            " "
        )

        .replace(
            /\n+/g,
            "\n"
        )

        .replace(
            /[ \t]+/g,
            " "
        )

        .trim();

}


// ==========================================
// CREATE DOCUMENT CHUNKS
// ==========================================

function createChunks(
    text,
    chunkSize = 900,
    overlap = 120
) {

    const clean =
        cleanText(text);

    const chunks = [];

    let start = 0;

    while (
        start < clean.length
    ) {

        const end =
            Math.min(
                start + chunkSize,
                clean.length
            );

        const chunk =
            clean
                .slice(
                    start,
                    end
                )
                .trim();

        if (
            chunk.length > 30
        ) {

            chunks.push(
                chunk
            );

        }

        if (
            end >= clean.length
        ) {

            break;

        }

        start =
            Math.max(
                end - overlap,
                start + 1
            );

    }

    return chunks;

}


// ==========================================
// EXTRACT TEXT
// ==========================================

async function extractText(
    filePath,
    originalName
) {

    const extension =
        path.extname(
            originalName
        ).toLowerCase();


    // --------------------------------------
    // PDF
    // --------------------------------------

    if (
        extension === ".pdf"
    ) {

        const buffer =
            fs.readFileSync(
                filePath
            );

        const result =
            await pdfParse(
                buffer
            );

        return result.text || "";

    }


    // --------------------------------------
    // DOCX
    // --------------------------------------

    if (
        extension === ".docx"
    ) {

        const result =
            await mammoth.extractRawText({

                path:
                    filePath

            });

        return result.value || "";

    }


    // --------------------------------------
    // TXT / MD
    // --------------------------------------

    return fs.readFileSync(
        filePath,
        "utf8"
    );

}


// ==========================================
// SEARCH SCORE
// ==========================================

function calculateScore(
    question,
    text
) {

    const stopWords =
        new Set([

            "what",
            "which",
            "where",
            "when",
            "why",
            "how",

            "the",
            "and",
            "for",
            "from",
            "this",
            "that",
            "with",

            "about",
            "into",

            "are",
            "was",
            "were",

            "can",
            "could",
            "does",
            "did",

            "explain",
            "tell",
            "give",
            "please",

            "show",
            "define",
            "describe"

        ]);


    const words =

        question
            .toLowerCase()
            .replace(
                /[^a-z0-9\s]/g,
                " "
            )
            .split(/\s+/)
            .filter(
                word =>
                    word.length > 2 &&
                    !stopWords.has(word)
            );


    const lowerText =
        text.toLowerCase();


    let score = 0;


    for (
        const word of words
    ) {

        if (
            lowerText.includes(
                word
            )
        ) {

            score += 2;

        }


        const count =
            lowerText.split(
                word
            ).length - 1;


        score += Math.min(
            count,
            5
        );

    }


    return score;

}


// ==========================================
// SEARCH DOCUMENTS
// ==========================================

function searchDocuments(
    question
) {

    const papers =
        readDatabase();

    const results = [];


    for (
        const paper of papers
    ) {

        for (
            const chunk
            of paper.chunks || []
        ) {

            results.push({

                paperId:
                    paper.id,

                title:
                    paper.title,

                author:
                    paper.author,

                year:
                    paper.year,

                journal:
                    paper.journal,

                reference:
                    paper.reference,

                fileName:
                    paper.originalFileName,

                text:
                    chunk,

                score:
                    calculateScore(
                        question,
                        chunk
                    )

            });

        }

    }


    return results

        .sort(
            (a, b) =>
                b.score -
                a.score
        )

        .slice(
            0,
            5
        );

}


// ==========================================
// GENERATE ANSWER
// ==========================================

function generateAnswer(
    question,
    results
) {

    const useful =
        results.filter(
            item =>
                item.score > 0
        );


    if (
        useful.length === 0
    ) {

        return (
            `I could not find enough information for "${question}" in your uploaded study materials.\n\n` +
            `Try asking the question using important keywords from your PDF or notes.`
        );

    }


    let answer = "";


    answer +=
        `Simple explanation of "${question}":\n\n`;


    useful
        .slice(
            0,
            3
        )
        .forEach(
            function (
                item,
                index
            ) {

                let text =
                    item.text
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim();


                if (
                    text.length > 500
                ) {

                    text =
                        text.substring(
                            0,
                            500
                        ) +
                        "...";

                }


                answer +=
                    `${index + 1}. ${text}\n\n`;

            }
        );


    answer +=
        "The explanation above is based on your uploaded study material.";


    return answer;

}


// ==========================================
// HOME PAGE
// ==========================================

app.get(
    "/",
    function (
        req,
        res
    ) {

        if (
            fs.existsSync(
                publicIndex
            )
        ) {

            return res.sendFile(
                publicIndex
            );

        }


        if (
            fs.existsSync(
                rootIndex
            )
        ) {

            return res.sendFile(
                rootIndex
            );

        }


        res
            .status(404)
            .send(
                "index.html not found. Put index.html inside the project folder or public folder."
            );

    }
);


// ==========================================
// UPLOAD API
// ==========================================

app.post(

    "/api/upload",

    upload.array(
        "materials",
        10
    ),

    async function (
        req,
        res
    ) {

        try {

            if (
                !req.files ||
                req.files.length === 0
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            "Please upload at least one file."

                    });

            }


            const papers =
                readDatabase();

            const uploaded = [];


            for (
                const file
                of req.files
            ) {

                try {

                    const text =
                        await extractText(

                            file.path,

                            file.originalname

                        );


                    const chunks =
                        createChunks(
                            text
                        );


                    const paper = {

                        id:
                            Date.now() +
                            Math.floor(
                                Math.random() *
                                100000
                            ),

                        title:
                            req.body.title ||
                            path.parse(
                                file.originalname
                            ).name,

                        author:
                            req.body.author ||
                            "Not provided",

                        year:
                            req.body.year ||
                            "",

                        journal:
                            req.body.journal ||
                            "",

                        reference:
                            req.body.reference ||
                            "",

                        description:
                            req.body.description ||
                            "",

                        originalFileName:
                            file.originalname,

                        fileName:
                            file.filename,

                        fileUrl:
                            "/uploads/" +
                            file.filename,

                        chunks:
                            chunks,

                        uploadedAt:
                            new Date()
                                .toISOString()

                    };


                    papers.unshift(
                        paper
                    );


                    uploaded.push({

                        title:
                            paper.title,

                        file:
                            paper.originalFileName,

                        chunks:
                            chunks.length,

                        characters:
                            text.length

                    });

                } catch (fileError) {

                    console.error(
                        "File processing error:",
                        fileError
                    );

                    uploaded.push({

                        file:
                            file.originalname,

                        error:
                            fileError.message

                    });

                }

            }


            saveDatabase(
                papers
            );


            res.json({

                success:
                    true,

                message:
                    "Material processed successfully.",

                materials:
                    uploaded

            });

        } catch (error) {

            console.error(
                "UPLOAD ERROR:",
                error
            );


            res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        error.message ||
                        "Could not process the uploaded material."

                });

        }

    }

);


// ==========================================
// ASK QUESTION API
// ==========================================

app.post(

    "/api/ask",

    function (
        req,
        res
    ) {

        try {

            const question =
                String(
                    req.body.question ||
                    ""
                ).trim();


            if (
                !question
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        message:
                            "Please enter a question."

                    });

            }


            const results =
                searchDocuments(
                    question
                );


            const answer =
                generateAnswer(

                    question,

                    results

                );


            const sources =

                results

                    .filter(
                        result =>
                            result.score > 0
                    )

                    .map(
                        result => ({

                            paperId:
                                result.paperId,

                            title:
                                result.title,

                            author:
                                result.author,

                            year:
                                result.year,

                            journal:
                                result.journal,

                            fileName:
                                result.fileName,

                            excerpt:
                                result.text.substring(
                                    0,
                                    300
                                )

                        })
                    );


            const words =

                question

                    .toLowerCase()

                    .replace(
                        /[^a-z0-9\s]/g,
                        ""
                    )

                    .split(/\s+/)

                    .filter(
                        word =>
                            word.length > 3
                    )

                    .slice(
                        0,
                        6
                    );


            res.json({

                success:
                    true,

                answer:
                    answer,

                sources:
                    sources,

                concepts:
                    [
                        ...new Set(
                            words
                        )
                    ]

            });

        } catch (error) {

            console.error(
                "ASK ERROR:",
                error
            );


            res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        "Something went wrong while searching."

                });

        }

    }

);


// ==========================================
// GET ALL MATERIALS
// ==========================================

app.get(

    "/api/materials",

    function (
        req,
        res
    ) {

        try {

            const papers =
                readDatabase();


            res.json(

                papers.map(
                    paper => ({

                        id:
                            paper.id,

                        title:
                            paper.title,

                        author:
                            paper.author,

                        year:
                            paper.year,

                        journal:
                            paper.journal,

                        reference:
                            paper.reference,

                        description:
                            paper.description,

                        fileName:
                            paper.originalFileName,

                        fileUrl:
                            paper.fileUrl,

                        chunks:
                            (
                                paper.chunks ||
                                []
                            ).length,

                        uploadedAt:
                            paper.uploadedAt

                    })
                )

            );

        } catch (error) {

            console.error(
                "MATERIALS ERROR:",
                error
            );


            res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        "Could not load materials."

                });

        }

    }

);


// ==========================================
// GET REFERENCE
// ==========================================

app.get(

    "/api/reference/:id",

    function (
        req,
        res
    ) {

        try {

            const papers =
                readDatabase();


            const paper =
                papers.find(

                    item =>
                        String(
                            item.id
                        ) ===
                        String(
                            req.params.id
                        )

                );


            if (
                !paper
            ) {

                return res
                    .status(404)
                    .json({

                        success:
                            false,

                        message:
                            "Material not found."

                    });

            }


            const reference =

                `${paper.author}. ` +

                `"${paper.title}." ` +

                `${paper.journal || ""} ` +

                `${paper.year || "n.d."}. ` +

                `${paper.reference || ""}`;


            res.json({

                success:
                    true,

                reference:
                    reference.trim(),

                paper:
                    paper

            });

        } catch (error) {

            console.error(
                "REFERENCE ERROR:",
                error
            );


            res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        "Could not create reference."

                });

        }

    }

);


// ==========================================
// HEALTH CHECK
// ==========================================

app.get(

    "/health",

    function (
        req,
        res
    ) {

        res.json({

            status:
                "OK",

            message:
                "StudyFlow AI server is running."

        });

    }

);


// ==========================================
// 404 API HANDLER
// ==========================================

app.use(
    "/api",
    function (
        req,
        res
    ) {

        res
            .status(404)
            .json({

                success:
                    false,

                message:
                    "API endpoint not found."

            });

    }
);


// ==========================================
// ERROR HANDLER
// ==========================================

app.use(

    function (
        error,
        req,
        res,
        next
    ) {

        console.error(
            "SERVER ERROR:",
            error
        );


        if (
            res.headersSent
        ) {

            return next(
                error
            );

        }


        res
            .status(400)
            .json({

                success:
                    false,

                message:
                    error.message ||
                    "Something went wrong."

            });

    }

);


// ==========================================
// START SERVER
// ==========================================

function startServer(port) {

    const server =
        app.listen(

            port,

            "0.0.0.0",

            function () {

                console.log("");
                console.log("========================================");
                console.log("          STUDYFLOW AI SERVER");
                console.log("========================================");
                console.log(
                    `Server running on port ${port}`
                );
                console.log(
                    `Website: http://localhost:${port}`
                );
                console.log(
                    `Health:  http://localhost:${port}/health`
                );
                console.log("========================================");
                console.log("");

            }

        );


    server.on(
        "error",
        function (error) {

            if (
                error.code ===
                "EADDRINUSE"
            ) {

                console.log("");
                console.log(
                    `Port ${port} is already in use.`
                );
                console.log(
                    `Trying port ${port + 1}...`
                );
                console.log("");

                startServer(
                    port + 1
                );

            } else {

                console.error(
                    "SERVER ERROR:",
                    error
                );

            }

        }
    );

}


startServer(
    START_PORT
);