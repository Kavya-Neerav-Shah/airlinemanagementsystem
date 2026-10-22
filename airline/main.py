from flask import Flask, request, jsonify
from flask_cors import CORS
from neo4j import GraphDatabase

app = Flask(__name__)
CORS(app)

# Neo4j database connection settings
URI = "neo4j://127.0.0.1:7687"
USER = "neo4j"
PASSWORD = "12345678"


def run_query(query, parameters=None):
    driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))
    with driver.session() as session:
        result = session.run(query, parameters)
        return [record.data() for record in result]


@app.route('/api/cities', methods=['GET'])
def get_cities():
    query = "MATCH (c:City) RETURN c.name AS name ORDER BY c.name"
    try:
        results = run_query(query)
        cities = [row["name"] for row in results if row.get("name")]
        return jsonify(cities)
    except Exception as e:
        return jsonify(["Delhi", "Mumbai", "Chennai", "Bengaluru"])


@app.route('/api/flights', methods=['GET'])
def get_flights():
    from_city = (
        request.args.get("from")
        or request.args.get("departure")
        or request.args.get("source")
    )
    to_city = (
        request.args.get("to")
        or request.args.get("arrival")
        or request.args.get("destination")
    )

    travel_date = (
        request.args.get("date")
        or request.args.get("travelDate")
        or request.args.get("departureDate")
        or request.args.get("travel_date")
        or request.args.get("day")
    )

    if not travel_date:
        travel_date = "24-10-2026"

    query = """
    MATCH (source:City)-[f:FLIGHT_TO]->(target:City)
    WHERE ($from IS NULL OR $from = '' OR source.name = $from)
      AND ($to IS NULL OR $to = '' OR target.name = $to)
    RETURN source.name AS departureCity, 
           target.name AS arrivalCity, 
           f.flightNumber AS flightNumber, 
           f.departureTime AS departureTime, 
           f.arrivalTime AS arrivalTime, 
           f.price AS price
    """

    try:
        results = run_query(query, {"from": from_city, "to": to_city})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    flights = []
    for row in results:
        city_from = row.get("departureCity")
        city_to = row.get("arrivalCity")
        flights.append({
            "flightNumber": row.get("flightNumber"),
            "departureCity": city_from,
            "arrivalCity": city_to,
            "from": city_from,
            "to": city_to,
            "origin": city_from,
            "destination": city_to,
            "departure": city_from,
            "arrival": city_to,
            "departureTime": row.get("departureTime"),
            "arrivalTime": row.get("arrivalTime"),
            "date": travel_date,
            "travelDate": travel_date,
            "departureDate": travel_date,
            "price": row.get("price"),
        })

    return jsonify(flights)


if __name__ == "__main__":
    app.run(debug=True, port=5000)