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


        // ---------------- middlewares ----------------

        const verifyToken = (req, res, next) => {
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

        // must be used after verifyToken
        const verifyAdmin = async (req, res, next) => {
            try {
                const user = await userCollection.findOne({ email: req.decoded.email });
                if (user?.role !== 'admin') {
                    return res.status(403).send({ message: 'forbidden access' });
                }
                next();
            } catch (error) {
                res.status(500).send({ message: 'Failed to verify admin' });
            }
        }


        // ---------------- users ----------------

        // all users (admin only)
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result)
        })

        // is the logged-in user an admin? (used by useAdmin)
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const user = await userCollection.findOne({ email: req.params.email });
            res.send({ admin: user?.role === 'admin' });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            //insert email if user does'nt exists
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            // role is always forced to "user" so nobody can register as admin
            const result = await userCollection.insertOne({ ...user, role: 'user' });
            res.send(result)
        })

        // make / remove admin (admin only)
        app.patch('/users/:id/role', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const { role } = req.body;
                if (!['admin', 'user'].includes(role)) {
                    return res.status(400).send({ message: 'Invalid role' });
                }

                const target = await userCollection.findOne({ _id: new ObjectId(req.params.id) });
                if (!target) return res.status(404).send({ message: 'User not found' });
                if (target.email === req.decoded.email) {
                    return res.status(400).send({ message: "You can't change your own role" });
                }

                const result = await userCollection.updateOne(
                    { _id: target._id },
                    { $set: { role } }
                );
                res.send(result);
            } catch (error) {
                res.status(400).send({ message: 'Invalid request' });
            }
        })


        // ---------------- pets ----------------

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

        // Mark a pet as adopted / available (body: { adopted: true | false })
        app.patch('/pets/:id/adopted', verifyToken, async (req, res) => {
            try {
                const adopted = req.body?.adopted !== false;
                const result = await petCollection.updateOne(
                    { _id: new ObjectId(req.params.id) },
                    { $set: { adopted } }
                );
                res.send(result);
            } catch (error) {
                console.error("Error updating adoption status:", error);
                res.status(500).send({ message: "Failed to update adoption status" });
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


        // ---------------- adoptions ----------------

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


        // ---------------- donation campaigns ----------------

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

        // create a campaign
        app.post('/donationPets', verifyToken, async (req, res) => {
            try {
                const { petName, image, maximumDonation, lastDate,
                    shortDescription, longDescription } = req.body;

                if (!petName || !image || !(Number(maximumDonation) > 0)) {
                    return res.status(400).send({ message: 'Invalid campaign data' });
                }

                const result = await donationPetsCollection.insertOne({
                    petName,
                    image,
                    maximumDonation: Number(maximumDonation),
                    lastDate,
                    shortDescription,
                    longDescription,
                    donatedAmount: 0,
                    paused: false,
                    ownerEmail: req.decoded.email,
                    createdAt: new Date(),
                });

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Failed to create campaign' });
            }
        });

        // campaigns created by the logged-in user
        app.get('/my-campaigns', verifyToken, async (req, res) => {
            const result = await donationPetsCollection
                .find({ ownerEmail: req.decoded.email })
                .sort({ createdAt: -1 })
                .toArray();
            res.send(result);
        });

        // edit (owner only, whitelisted fields)
        app.patch('/donationPets/:id', verifyToken, async (req, res) => {
            try {
                const { petName, image, maximumDonation, lastDate,
                    shortDescription, longDescription } = req.body;

                const campaign = await donationPetsCollection.findOne({
                    _id: new ObjectId(req.params.id),
                    ownerEmail: req.decoded.email,
                });
                if (!campaign) return res.status(404).send({ message: 'Campaign not found' });

                if (Number(maximumDonation) < (campaign.donatedAmount || 0)) {
                    return res.status(400).send({ message: 'Goal is below the amount already raised' });
                }

                await donationPetsCollection.updateOne(
                    { _id: campaign._id },
                    {
                        $set: {
                            petName, image, maximumDonation: Number(maximumDonation),
                            lastDate, shortDescription, longDescription
                        }
                    }
                );
                res.send({ success: true });
            } catch (error) {
                res.status(400).send({ message: 'Invalid request' });
            }
        });

        // pause / resume
        app.patch('/donationPets/:id/pause', verifyToken, async (req, res) => {
            try {
                const result = await donationPetsCollection.updateOne(
                    { _id: new ObjectId(req.params.id), ownerEmail: req.decoded.email },
                    { $set: { paused: !!req.body.paused } }
                );
                if (result.matchedCount === 0)
                    return res.status(404).send({ message: 'Campaign not found' });
                res.send({ success: true });
            } catch (error) {
                res.status(400).send({ message: 'Invalid request' });
            }
        });


        // ---------------- payments & donations ----------------

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

        // save a donation
        app.post("/donations", verifyToken, async (req, res) => {
            try {
                const donation = req.body;

                const result = await donationCollection.insertOne({
                    campaignId: new ObjectId(donation.campaignId),
                    petName: donation.petName,
                    amount: Number(donation.amount),
                    transactionId: donation.transactionId,
                    donorEmail: req.decoded.email,
                    donatedAt: new Date(),
                });

                // update the campaign total (donationPets, not pets)
                await donationPetsCollection.updateOne(
                    { _id: new ObjectId(donation.campaignId) },
                    { $inc: { donatedAmount: Number(donation.amount) } }
                );

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to save donation" });
            }
        });

        // donations made by the logged-in user
        app.get("/my-donations", verifyToken, async (req, res) => {
            const result = await donationCollection
                .find({ donorEmail: req.decoded.email })
                .sort({ donatedAt: -1 })
                .toArray();
            res.send(result);
        });

        // all donations (admin only)
        app.get('/donations', verifyToken, verifyAdmin, async (req, res) => {
            const result = await donationCollection
                .find()
                .sort({ donatedAt: -1 })
                .toArray();
            res.send(result);
        });


        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello from PawsHome!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})