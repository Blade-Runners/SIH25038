/**
 * Data Similarity Utilities for Blue Carbon MRV system
 * Compares restoration data submissions for peer validation
 */

export class DataSimilarity {
  constructor(similarityThreshold = 0.85) {
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * Compare two restoration data submissions
   * @param {Object} data1 - First data submission
   * @param {Object} data2 - Second data submission
   * @returns {Object} Comparison result with similarity score
   */
  compareRestorationData(data1, data2) {
    const similarities = {
      location: this.compareLocation(data1.location, data2.location),
      area: this.compareArea(data1.area, data2.area),
      organizationId: this.compareOrganizationId(data1.organizationId, data2.organizationId),
      species: this.compareSpeciesData(data1.speciesData || [], data2.speciesData || []),
      timestamp: this.compareTimestamp(data1.timestamp, data2.timestamp),
      images: this.compareImages(data1.images || [], data2.images || [])
    };

    // Calculate weighted overall similarity
    const weights = {
      location: 0.3,    // 30% - GPS coordinates are critical
      area: 0.2,        // 20% - Area measurement is important
      organizationId: 0.1, // 10% - Organization should match
      species: 0.2,     // 20% - Species data is important
      timestamp: 0.1,   // 10% - Time correlation
      images: 0.1       // 10% - Image metadata
    };

    let totalSimilarity = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(weights)) {
      if (similarities[key] !== null) {
        totalSimilarity += similarities[key] * weight;
        totalWeight += weight;
      }
    }

    const overallSimilarity = totalWeight > 0 ? totalSimilarity / totalWeight : 0;
    const isSimilar = overallSimilarity >= this.similarityThreshold;

    return {
      overall: overallSimilarity,
      isSimilar,
      threshold: this.similarityThreshold,
      details: similarities,
      breakdown: this.calculateBreakdown(similarities, weights)
    };
  }

  /**
   * Compare GPS location coordinates
   * @param {Object} loc1 - First location {latitude, longitude}  
   * @param {Object} loc2 - Second location {latitude, longitude}
   * @returns {number} Similarity score (0-1)
   */
  compareLocation(loc1, loc2) {
    if (!loc1 || !loc2 || !loc1.latitude || !loc1.longitude || !loc2.latitude || !loc2.longitude) {
      return 0;
    }

    const latDiff = Math.abs(loc1.latitude - loc2.latitude);
    const lngDiff = Math.abs(loc1.longitude - loc2.longitude);

    // Allow small GPS variations (within ~100 meters at equator)
    const tolerance = 0.001; // approximately 111 meters
    
    const latSimilarity = latDiff <= tolerance ? 1 : Math.max(0, 1 - (latDiff / tolerance));
    const lngSimilarity = lngDiff <= tolerance ? 1 : Math.max(0, 1 - (lngDiff / tolerance));

    return (latSimilarity + lngSimilarity) / 2;
  }

  /**
   * Compare area measurements
   * @param {number} area1 - First area measurement
   * @param {number} area2 - Second area measurement  
   * @returns {number} Similarity score (0-1)
   */
  compareArea(area1, area2) {
    if (!area1 || !area2 || area1 <= 0 || area2 <= 0) {
      return 0;
    }

    const ratio = Math.min(area1, area2) / Math.max(area1, area2);
    
    // Allow 10% variance in area measurements
    const tolerance = 0.9;
    
    return ratio >= tolerance ? ratio : 0;
  }

  /**
   * Compare organization IDs
   * @param {string} org1 - First organization ID
   * @param {string} org2 - Second organization ID
   * @returns {number} Similarity score (0 or 1)
   */
  compareOrganizationId(org1, org2) {
    if (!org1 || !org2) return 0;
    return org1.toString().toLowerCase() === org2.toString().toLowerCase() ? 1 : 0;
  }

  /**
   * Compare species data arrays
   * @param {Array} species1 - First species data array
   * @param {Array} species2 - Second species data array
   * @returns {number} Similarity score (0-1)
   */
  compareSpeciesData(species1, species2) {
    if (!Array.isArray(species1) || !Array.isArray(species2)) {
      return 0;
    }

    if (species1.length === 0 && species2.length === 0) {
      return 1; // Both empty, considered similar
    }

    if (species1.length === 0 || species2.length === 0) {
      return 0; // One empty, one not
    }

    // Compare species types and counts
    const types1 = species1.map(s => s.type?.toLowerCase()).filter(Boolean);
    const types2 = species2.map(s => s.type?.toLowerCase()).filter(Boolean);

    if (types1.length === 0 || types2.length === 0) {
      return 0.5; // Has species but no types specified
    }

    const intersection = types1.filter(type => types2.includes(type));
    const union = [...new Set([...types1, ...types2])];

    return union.length > 0 ? intersection.length / union.length : 0;
  }

  /**
   * Compare timestamps for temporal correlation
   * @param {string|number} time1 - First timestamp
   * @param {string|number} time2 - Second timestamp
   * @returns {number} Similarity score (0-1)
   */
  compareTimestamp(time1, time2) {
    if (!time1 || !time2) return 0;

    const t1 = new Date(time1).getTime();
    const t2 = new Date(time2).getTime();

    if (isNaN(t1) || isNaN(t2)) return 0;

    const timeDiff = Math.abs(t1 - t2);
    const hourInMs = 60 * 60 * 1000;

    // Allow submissions within 1 hour to be considered similar
    if (timeDiff <= hourInMs) return 1;
    
    // Gradual decrease over 24 hours
    const dayInMs = 24 * hourInMs;
    return Math.max(0, 1 - (timeDiff / dayInMs));
  }

  /**
   * Compare image metadata arrays
   * @param {Array} images1 - First images array
   * @param {Array} images2 - Second images array
   * @returns {number} Similarity score (0-1)
   */
  compareImages(images1, images2) {
    if (!Array.isArray(images1) || !Array.isArray(images2)) {
      return 0;
    }

    if (images1.length === 0 && images2.length === 0) {
      return 1; // Both have no images
    }

    if (images1.length === 0 || images2.length === 0) {
      return 0.5; // One has images, one doesn't
    }

    // For now, just compare count (in real implementation, would compare hashes/metadata)
    const countRatio = Math.min(images1.length, images2.length) / Math.max(images1.length, images2.length);
    return countRatio;
  }

  /**
   * Calculate detailed breakdown of similarities
   * @param {Object} similarities - Individual similarity scores
   * @param {Object} weights - Weight values
   * @returns {Object} Detailed breakdown
   */
  calculateBreakdown(similarities, weights) {
    const breakdown = {};
    
    for (const [key, similarity] of Object.entries(similarities)) {
      if (similarity !== null) {
        breakdown[key] = {
          score: similarity,
          weight: weights[key] || 0,
          contribution: (similarity * (weights[key] || 0)),
          status: similarity >= this.similarityThreshold ? 'PASS' : 'FAIL'
        };
      }
    }
    
    return breakdown;
  }

  /**
   * Check if multiple submissions are similar (for group validation)
   * @param {Array} submissions - Array of data submissions
   * @returns {Object} Group similarity analysis
   */
  checkGroupSimilarity(submissions) {
    if (!Array.isArray(submissions) || submissions.length < 2) {
      return { similar: false, reason: 'Insufficient submissions for comparison' };
    }

    const comparisons = [];
    const similarPairs = [];

    // Compare each submission with every other submission
    for (let i = 0; i < submissions.length; i++) {
      for (let j = i + 1; j < submissions.length; j++) {
        const comparison = this.compareRestorationData(submissions[i], submissions[j]);
        comparisons.push({
          indices: [i, j],
          similarity: comparison.overall,
          isSimilar: comparison.isSimilar
        });

        if (comparison.isSimilar) {
          similarPairs.push([i, j]);
        }
      }
    }

    // Find the largest group of similar submissions
    const groups = this.findSimilarGroups(submissions.length, similarPairs);
    const largestGroup = groups.reduce((max, group) => 
      group.length > max.length ? group : max, []);

    const totalComparisons = comparisons.length;
    const similarComparisons = comparisons.filter(c => c.isSimilar).length;
    const averageSimilarity = comparisons.reduce((sum, c) => sum + c.similarity, 0) / totalComparisons;

    return {
      totalSubmissions: submissions.length,
      totalComparisons,
      similarComparisons,
      averageSimilarity,
      largestSimilarGroup: largestGroup.length,
      groupConsensus: largestGroup.length >= Math.ceil(submissions.length * this.similarityThreshold),
      details: {
        comparisons,
        groups,
        largestGroup
      }
    };
  }

  /**
   * Find groups of similar submissions using Union-Find algorithm
   * @param {number} totalCount - Total number of submissions
   * @param {Array} similarPairs - Array of similar pair indices
   * @returns {Array} Array of groups (each group is array of indices)
   */
  findSimilarGroups(totalCount, similarPairs) {
    // Initialize Union-Find structure
    const parent = Array.from({ length: totalCount }, (_, i) => i);
    
    function find(x) {
      if (parent[x] !== x) {
        parent[x] = find(parent[x]); // Path compression
      }
      return parent[x];
    }
    
    function union(x, y) {
      const rootX = find(x);
      const rootY = find(y);
      if (rootX !== rootY) {
        parent[rootX] = rootY;
      }
    }

    // Union similar pairs
    for (const [i, j] of similarPairs) {
      union(i, j);
    }

    // Group by root parent
    const groups = {};
    for (let i = 0; i < totalCount; i++) {
      const root = find(i);
      if (!groups[root]) {
        groups[root] = [];
      }
      groups[root].push(i);
    }

    return Object.values(groups);
  }

  /**
   * Update similarity threshold
   * @param {number} threshold - New threshold (0-1)
   */
  setSimilarityThreshold(threshold) {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Similarity threshold must be between 0 and 1');
    }
    this.similarityThreshold = threshold;
  }

  /**
   * Get current similarity threshold
   * @returns {number} Current threshold
   */
  getSimilarityThreshold() {
    return this.similarityThreshold;
  }
}

export default DataSimilarity;