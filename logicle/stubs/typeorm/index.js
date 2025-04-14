// A no-op decorator factory that returns the target unchanged
function createDecorator() {
  return () => (target) => target
}

// Only implement Column (and PrimaryGeneratedColumn if needed)
module.exports.Column = (options) => createDecorator()
module.exports.PrimaryGeneratedColumn = () => createDecorator()
module.exports.Entity = () => createDecorator()
module.exports.Index = () => createDecorator()
module.exports.ManyToOne = () => createDecorator()
// Export any other decorators you encounter errors for:
module.exports.CreateDateColumn = () => createDecorator()
module.exports.UpdateDateColumn = () => createDecorator()
module.exports.DeleteDateColumn = () => createDecorator()
