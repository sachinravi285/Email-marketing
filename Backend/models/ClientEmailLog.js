import mongoose from "mongoose";

const ClientEmailLogSchema = new mongoose.Schema({
  email: String,
  subject: String,
  company: String,
  sentAt: { type: Date, default: Date.now },
  clickedLinks: [
    {
      url: String,
      clickedAt: Date,
    },
  ],
});

export default mongoose.model("ClientEmailLog", ClientEmailLogSchema);
