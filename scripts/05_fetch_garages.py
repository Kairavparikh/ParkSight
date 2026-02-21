#!/usr/bin/env python3
"""Fetch parking garage data from Google Places API."""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.data.google_places import fetch_parking_garages, estimate_pricing
import json
import argparse


def main():
    parser = argparse.ArgumentParser(description='Fetch parking garage data')
    parser.add_argument('--api-key', type=str, required=True,
                       help='Google Places API key')
    parser.add_argument('--radius', type=int, default=10000,
                       help='Search radius in meters (default: 10000)')
    args = parser.parse_args()

    print("="*70)
    print("ParkSight - Parking Garage Data Fetcher")
    print("="*70)
    print()

    # Atlanta coordinates
    center_lat = 33.7490
    center_lon = -84.3880

    # Fetch garages
    garages = fetch_parking_garages(
        center_lat=center_lat,
        center_lon=center_lon,
        radius=args.radius,
        api_key=args.api_key
    )

    # Add estimated pricing to each garage
    for feature in garages['features']:
        price_level = feature['properties'].get('price_level')

        # If Google didn't provide price_level, estimate based on location/rating
        if price_level is None:
            # Default to moderate pricing (level 2) if no data
            price_level = 2
            feature['properties']['price_level'] = price_level

        pricing = estimate_pricing(price_level)
        feature['properties']['estimated_hourly'] = pricing['hourly']
        feature['properties']['estimated_daily'] = pricing['daily']
        feature['properties']['price_description'] = pricing['description']

    # Save to file
    output_path = 'outputs/parking_garages.geojson'
    os.makedirs('outputs', exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(garages, f, indent=2)

    print()
    print("="*70)
    print(f"✓ Saved {len(garages['features'])} garages to {output_path}")
    print("="*70)
    print()

    # Print summary
    if garages['features']:
        total_ratings = sum(f['properties'].get('total_ratings', 0)
                          for f in garages['features'])
        avg_rating = sum(f['properties'].get('rating', 0)
                        for f in garages['features']) / len(garages['features'])

        print("Summary:")
        print(f"  - Total garages: {len(garages['features'])}")
        print(f"  - Average rating: {avg_rating:.1f}/5.0")
        print(f"  - Total reviews: {total_ratings:,}")
        print()
        print("Top 5 highest-rated garages:")
        sorted_garages = sorted(garages['features'],
                               key=lambda x: x['properties'].get('rating', 0),
                               reverse=True)[:5]
        for i, garage in enumerate(sorted_garages, 1):
            props = garage['properties']
            print(f"  {i}. {props['name']} - {props.get('rating', 'N/A')}/5.0 "
                  f"({props.get('total_ratings', 0)} reviews)")


if __name__ == '__main__':
    main()
