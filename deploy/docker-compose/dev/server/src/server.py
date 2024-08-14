from fastapi import FastAPI, Request
from pydantic import BaseModel

app = FastAPI()

class Numbers(BaseModel):
    a: float
    b: float

@app.post("/sum")
def sum_numbers(numbers: Numbers, request: Request):
    print(numbers)
    print(request.headers)
    return {"sum": numbers.a + numbers.b}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)