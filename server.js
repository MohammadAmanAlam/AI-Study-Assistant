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

const PORT = 3001;


// ==========================================
// FOLDERS
// ==========================================

const uploadDir = path.join(__dirname, "uploads");
const dataDir = path.join(__dirname, "data");
const database = path.join(dataDir, "papers.json");


// Create folders automatically

fs.mkdirSync(uploadDir, {
    recursive: true
});

fs.mkdirSync(dataDir, {
    recursive: true
});


// Create database file if it doesn't exist

if (!fs.existsSync(database)) {

    fs.writeFileSync(
        database,
        "[]"
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


// Serve website

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// Serve uploaded files

app.use(
    "/uploads",
    express.static(uploadDir)
);


// ==========================================
// MULTER FILE UPLOAD
// ==========================================

const storage = multer.diskStorage({

    destination: function (
        req,
        file,
        cb
    ) {

        cb(
            null,
            uploadDir
        );
    },


    filename: function (
        req,
        file,
        cb
    ) {

        const safeName =
            file.originalname.replace(
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


    fileFilter:
        function (
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


        return JSON.parse(data);

    } catch (error) {

        return [];
    }
}


function saveDatabase(data) {

    fs.writeFileSync(

        database,

        JSON.stringify(
            data,
            null,
            2
        )
    );
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
// SPLIT DOCUMENT INTO CHUNKS
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
// EXTRACT TEXT FROM FILE
// ==========================================

async function extractText(
    filePath,
    originalName
) {

    const extension =
        path.extname(
            originalName
        ).toLowerCase();


    // --------------------------
    // PDF
    // --------------------------

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


        return result.text;
    }


    // --------------------------
    // DOCX
    // --------------------------

    if (
        extension === ".docx"
    ) {

        const result =
            await mammoth.extractRawText({

                path:
                    filePath

            });


        return result.value;
    }


    // --------------------------
    // TXT / MD
    // --------------------------

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
            "does",

            "explain",
            "tell",
            "give"

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

                    !stopWords.has(
                        word
                    )
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
// GENERATE SIMPLE ANSWER
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

        return `I could not find enough information for this question in your uploaded materials.

Try asking the question using important words from your PDF.`;
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
                        chunks.length

                });
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
                error
            );


            res
                .status(400)
                .json({

                    message:
                        error.message

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
                error
            );


            res
                .status(500)
                .json({

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

                    fileName:
                        paper.originalFileName,

                    fileUrl:
                        paper.fileUrl,

                    chunks:
                        paper.chunks.length

                })
            )
        );
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

            reference:
                reference.trim(),

            paper:
                paper

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
            error
        );


        res
            .status(400)
            .json({

                message:
                    error.message ||
                    "Something went wrong."

            });
    }
);


// ==========================================
// START SERVER
// ==========================================

app.listen(

    PORT,

    function () {

        console.log("");
        console.log(
            "===================================="
        );

        console.log(
            "       STUDYFLOW AI SERVER"
        );

        console.log(
            "===================================="
        );

        console.log(
            `Server running at: http://localhost:${PORT}`
        );

        console.log(
            "===================================="
        );

        console.log("");
    }

);