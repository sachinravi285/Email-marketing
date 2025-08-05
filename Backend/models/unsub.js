import mongoose from "mongoose";

const UnsubSchema = new mongoose.Schema({
  email: { type: String, unique: true }
});

export default mongoose.model("Unsub", UnsubSchema);
