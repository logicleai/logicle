const vars = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'dialog-background',
]

const palette = () => {
  return (
    <table className="light">
      <tbody>
        {vars.map((cssVar) => {
          return (
            <tr key={cssVar}>
              <td>
                <span>{cssVar}</span>
              </td>
              <td>
                <div className={`border space-y-2 bg-${cssVar} w-[180px] h-[24px]`}></div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default palette
