const Notification = require("../models/Notification");

exports.getNotifications = async (req, res, next) => {
  try {
    const filter = req.user.role === "admin"
      ? { $or: [{ recipientId: req.user._id }, { recipientId: null }] }
      : { recipientId: req.user._id };
    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    const unreadCount = notifications.filter((item) => !item.readAt).length;
    return res.json({ success: true, notifications, unreadCount });
  } catch (error) { next(error); }
};

exports.markRead = async (req, res, next) => {
  try {
    const ownerFilter = req.user.role === "admin"
      ? { $or: [{ recipientId: req.user._id }, { recipientId: null }] }
      : { recipientId: req.user._id };
    const filter = { _id: req.params.notificationId, ...ownerFilter };
    const notification = await Notification.findOneAndUpdate(filter, { readAt: new Date() }, { new: true });
    if (!notification) return res.status(404).json({ success: false, message: "Notification not found." });
    return res.json({ success: true, notification });
  } catch (error) { next(error); }
};

exports.markAllRead = async (req, res, next) => {
  try {
    const filter = req.user.role === "admin"
      ? { $or: [{ recipientId: req.user._id }, { recipientId: null }], readAt: null }
      : { recipientId: req.user._id, readAt: null };
    await Notification.updateMany(filter, { readAt: new Date() });
    return res.json({ success: true, message: "Notifications marked as read." });
  } catch (error) { next(error); }
};
