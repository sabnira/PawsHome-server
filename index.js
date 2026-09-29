require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const app = express()
const cors = require('cors')
const jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000



//middleware
app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zlvar1f.mongodb.net/?appName=Cluster0`;



const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


async function run() {
    try {
        // await client.connect();

        const userCollection = client.db("pawsHomeDb").collection("users")
        const petCollection = client.db("pawsHomeDb").collection("pets")
        const adoptionCollection = client.db("pawsHomeDb").collection("adoptions");
        const donationPetsCollection = client.db("pawsHomeDb").collection("donationPets");
        const donationCollection = client.db("pawsHomeDb").collection("donations");

        //jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body
            // create token
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '365d' })

            res.send({ token })
        })


        // verifyToken middlewares
        const verifyToken = (req, res, next) => {
            console.log('inside verify token', req.headers.authorization);

            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const token = req.headers.authorization.split(' ')[1];

            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next()
            })

        }



        //users related api
        app.get('/users', verifyToken, async (req, res) => {
            console.log(req.headers);
            const result = await userCollection.find().toArray();
            res.send(result)
        })


        app.post('/users', async (req, res) => {
            const user = req.body;
            //insert email if user does'nt exists
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result)
        })


        //get all pets data from db and search and category
        app.get('/pets', async (req, res) => {

            const { searchParams, category } = req.query;

            let option = {};

            if (searchParams) {
                option.name = {
                    $regex: searchParams,
                    $options: "i"
                };
            }

            if (category) {
                option.category = category;
            }

            const result = await petCollection.find(option).toArray();

            res.send(result);
        });

        // Add a new pet
        app.post('/pets', async (req, res) => {
            try {
                const pet = req.body;

                const result = await petCollection.insertOne(pet);

                res.send({
                    success: true,
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("Error adding pet:", error);

                res.status(500).send({
                    success: false,
                    message: "Failed to add pet",
                });
            }
        });


        //get a single pet data by id from db
        app.get('/pet/:id', async (req, res) => {
            try {
                const id = req.params.id
                const query = { _id: new ObjectId(id) }
                const result = await petCollection.findOne(query)

                if (!result) return res.status(404).send({ message: 'Pet not found' })
                res.send(result)

            } catch (err) {
                res.status(400).send({ message: 'Invalid pet id' })
            }
        })

        // Get pets added by a specific user
        app.get('/my-pets', async (req, res) => {
            try {
                const email = req.query.email;

                if (!email) {
                    return res.status(400).send({
                        message: "Email is required"
                    });
                }

                const result = await petCollection
                    .find({ ownerEmail: email })
                    .toArray();

                res.send(result);
            } catch (error) {
                console.error("Error getting user's pets:", error);

                res.status(500).send({
                    message: "Failed to get your pets"
                });
            }
        });

        // Mark a pet as adopted
        app.patch('/pets/:id/adopted', async (req, res) => {
            try {
                const id = req.params.id;

                const result = await petCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            adopted: true
                        }
                    }
                );

                res.send(result);
            } catch (error) {
                console.error("Error marking pet as adopted:", error);

                res.status(500).send({
                    message: "Failed to update adoption status"
                });
            }
        });


        // Delete a pet
        app.delete('/pets/:id', async (req, res) => {
            try {
                const id = req.params.id;

                const result = await petCollection.deleteOne({
                    _id: new ObjectId(id)
                });

                res.send(result);
            } catch (error) {
                console.error("Error deleting pet:", error);

                res.status(500).send({
                    message: "Failed to delete pet"
                });
            }
        });

        app.patch('/pets/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const updatedPet = req.body;

                const petData = {
                    image: updatedPet.image,
                    name: updatedPet.name,
                    age: updatedPet.age,
                    location: updatedPet.location,
                    price: Number(updatedPet.price),
                    gender: updatedPet.gender,
                    category: updatedPet.category,
                };

                const result = await petCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: petData,
                    }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({
                        success: false,
                        message: "Pet not found",
                    });
                }

                res.send({
                    success: true,
                    modifiedCount: result.modifiedCount,
                });
            } catch (error) {
                console.error("Error updating pet:", error);

                res.status(500).send({
                    success: false,
                    message: "Failed to update pet",
                });
            }
        });


        //pet adoption form
        app.post("/adoptions", async (req, res) => {
            try {
                const adoptionData = req.body;

                const result = await adoptionCollection.insertOne(adoptionData);

                res.status(201).send({
                    success: true,
                    message: "Adoption request submitted successfully",
                    result,
                });
            } catch (error) {
                console.error(error);

                res.status(500).send({
                    success: false,
                    message: "Failed to submit adoption request",
                });
            }
        });


        app.get('/my-adoption-requests', async (req, res) => {
            try {
                const ownerEmail = req.query.email;

                if (!ownerEmail) {
                    return res.status(400).send({
                        message: "Owner email is required"
                    });
                }

                // Find all pets added by the current user
                const pets = await petCollection
                    .find({ ownerEmail })
                    .project({ _id: 1 })
                    .toArray();

                // Convert ObjectId to string because adoption petId is a string
                const petIds = pets.map(pet => pet._id.toString());

                if (petIds.length === 0) {
                    return res.send([]);
                }

                // Find adoption requests for those pets
                const requests = await adoptionCollection
                    .find({
                        petId: { $in: petIds }
                    })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send(requests);

            } catch (error) {
                console.error("Error getting adoption requests:", error);

                res.status(500).send({
                    message: "Failed to get adoption requests"
                });
            }
        });

        //adoption requests accept from pending
        app.patch('/adoption-requests/:id/accept', async (req, res) => {
            try {
                const id = req.params.id;

                const result = await adoptionCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            status: "accepted"
                        }
                    }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({
                        success: false,
                        message: "Adoption request not found"
                    });
                }

                res.send({
                    success: true,
                    modifiedCount: result.modifiedCount
                });

            } catch (error) {
                console.error("Error accepting adoption request:", error);

                res.status(500).send({
                    success: false,
                    message: "Failed to accept adoption request"
                });
            }
        });

        //adoption requests reject from pending
        app.patch('/adoption-requests/:id/reject', async (req, res) => {
            try {
                const id = req.params.id;

                const result = await adoptionCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            status: "rejected"
                        }
                    }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({
                        success: false,
                        message: "Adoption request not found"
                    });
                }

                res.send({
                    success: true,
                    modifiedCount: result.modifiedCount
                });

            } catch (error) {
                console.error("Error rejecting adoption request:", error);

                res.status(500).send({
                    success: false,
                    message: "Failed to reject adoption request"
                });
            }
        });


        //get all donation pets data from db
        app.get('/donationPets', async (req, res) => {

            const result = await donationPetsCollection.find().toArray();

            res.send(result);
        });

        //get a single donation pet data by id from db
        app.get('/donationPet/:id', async (req, res) => {
            try {
                const id = req.params.id
                const query = { _id: new ObjectId(id) }
                const result = await donationPetsCollection.findOne(query)

                if (!result) return res.status(404).send({ message: 'Pet not found' })
                res.send(result)

            } catch (err) {
                res.status(400).send({ message: 'Invalid pet id' })
            }
        })


        app.post("/create-payment-intent", async (req, res) => {
            try {
                const { amount } = req.body;

                const paymentIntent = await stripe.paymentIntents.create({
                    amount: Math.round(amount * 100),
                    currency: "usd",
                    payment_method_types: ["card"],
                });

                res.send({
                    clientSecret: paymentIntent.client_secret,
                });

            } catch (error) {
                console.error(error);

                res.status(500).send({
                    message: "Failed to create payment intent",
                });
            }
        });

        app.post("/donations", async (req, res) => {
            try {
                const donation = req.body;

                const result = await donationCollection.insertOne({
                    campaignId: new ObjectId(donation.campaignId),
                    petName: donation.petName,
                    amount: donation.amount,
                    transactionId: donation.transactionId,
                    donatedAt: new Date(),
                });

                // Update campaign donatedAmount
                await petCollection.updateOne(
                    {
                        _id: new ObjectId(donation.campaignId),
                    },
                    {
                        $inc: {
                            donatedAmount: donation.amount,
                        },
                    }
                );

                res.send(result);

            } catch (error) {
                console.error(error);

                res.status(500).send({
                    message: "Failed to save donation",
                });
            }
        });

        // app.get("/donations/:campaignId", async (req, res) => {

        //     const campaignId = req.params.campaignId;

        //     const result = await donationCollection
        //         .find({
        //             campaignId: new ObjectId(campaignId),
        //         })
        //         .sort({
        //             donatedAt: -1,
        //         })
        //         .toArray();

        //     res.send(result);
        // });



        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello from PawsHome!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
